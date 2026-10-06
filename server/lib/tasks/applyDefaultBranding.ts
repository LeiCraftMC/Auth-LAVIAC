import { TaskHandler } from "@cleverjs/utils";
import { Audit } from "../utils/audit";
import { ZitadelBranding } from "../zitadel/branding";
import { ZitadelApiError, ZitadelClient } from "../zitadel/client";

export type ApplyDefaultBrandingArgs = {
	instanceId: string;
	/** `user_sub` of the session that triggered the task — recorded in the audit log. */
	actorSub: string;
};

type ApplyDefaultBrandingState = {
	instanceHost?: string;
};

type TaskLogger = TaskHandler.BasicTaskLoggerLike;
type PausedRef = Parameters<TaskHandler.SubTaskStepFn>[3];

// A freshly created instance becomes addressable a few seconds after `_create` returns (Zitadel's
// projections catch up asynchronously), so transient failures are retried for about a minute.
const RETRY_ATTEMPTS = 20;
const RETRY_DELAY_MS = 3000;

// Client errors that retrying cannot fix.
const PERMANENT_STATUSES = [400, 401, 403];

/** Zitadel rejects writing a policy that equals the stored one — that is a success here. */
function isNotChangedError(err: unknown) {
	return err instanceof ZitadelApiError && /not (been )?changed|NotChanged/i.test(err.message);
}

function describeError(err: unknown) {
	if (err instanceof ZitadelApiError && err.status === 403) {
		return `${err.message} — the system user needs IAM_OWNER through a "System" membership in SystemAPIUsers`;
	}
	return err instanceof Error ? err.message : String(err);
}

async function withRetries(
	label: string,
	logger: TaskLogger,
	isPaused: PausedRef,
	fn: () => Promise<void>,
): Promise<TaskHandler.StepBasedTaskReturn> {
	for (let attempt = 1; ; attempt++) {
		if (isPaused.getV()) {
			return { success: true, paused: true };
		}

		try {
			await fn();
			return { success: true };
		} catch (err) {
			if (isNotChangedError(err)) {
				logger.info(`${label}: already up to date.`);
				return { success: true };
			}

			const permanent = err instanceof ZitadelApiError && PERMANENT_STATUSES.includes(err.status);
			if (permanent || attempt >= RETRY_ATTEMPTS) {
				logger.error(`${label} failed: ${describeError(err)}`);
				return { success: false, message: `${label} failed: ${describeError(err)}` };
			}

			logger.warn(
				`${label} failed (attempt ${attempt}/${RETRY_ATTEMPTS}): ${describeError(err)} — retrying.`,
			);
			await Bun.sleep(RETRY_DELAY_MS);
		}
	}
}

/**
 * Applies {@link ZitadelBranding.DEFAULT_LABEL_POLICY} and the default font to one instance:
 * resolve the instance's domain → write the preview label policy → upload the font → activate.
 * Step-based, so a LAVIAC restart resumes at the step it stopped on.
 */
export const ApplyDefaultBrandingTask = new TaskHandler.StepBasedTaskFn(
	"applyDefaultBranding",
	async (args: ApplyDefaultBrandingArgs, logger, state: ApplyDefaultBrandingState, isPaused) => {
		logger.info(`Resolving the domain of instance ${args.instanceId}...`);

		return withRetries("Resolving the instance domain", logger, isPaused, async () => {
			const instance = await ZitadelClient.getInstance(args.instanceId);
			if (instance.state !== "STATE_RUNNING") {
				throw new Error(`Instance is ${instance.state}, waiting for STATE_RUNNING`);
			}

			const domain = ZitadelClient.getInstanceHost(instance);
			if (!domain) {
				throw new Error("Instance has no domain yet");
			}

			state.instanceHost = domain;
			logger.info(`Using instance host ${domain}.`);
		});
	},
)
	.addStep("Update the label policy", async (_args, logger, state, isPaused) => {
		const instanceHost = state.instanceHost;
		if (!instanceHost) return { success: false, message: "Instance host not resolved" };

		return withRetries("Updating the label policy", logger, isPaused, () =>
			ZitadelClient.updateLabelPolicy(instanceHost, ZitadelBranding.DEFAULT_LABEL_POLICY),
		);
	})
	.addStep("Upload the branding font", async (_args, logger, state, isPaused) => {
		const instanceHost = state.instanceHost;
		if (!instanceHost) return { success: false, message: "Instance host not resolved" };

		const font = await ZitadelBranding.loadFont();
		if (!font) {
			logger.warn("The default branding font is unavailable — skipping the font upload.");
			return { success: true };
		}

		return withRetries("Uploading the font", logger, isPaused, () =>
			ZitadelClient.uploadLabelPolicyFont(
				instanceHost,
				font,
				ZitadelBranding.FONT.fileName,
				ZitadelBranding.FONT.contentType,
			),
		);
	})
	.addStep("Activate the label policy", async (args, logger, state, isPaused) => {
		const instanceHost = state.instanceHost;
		if (!instanceHost) return { success: false, message: "Instance host not resolved" };

		const result = await withRetries("Activating the label policy", logger, isPaused, () =>
			ZitadelClient.activateLabelPolicy(instanceHost),
		);

		if (result.success && !result.paused) {
			await Audit.log(args.actorSub, "instance.branding.apply", args.instanceId, instanceHost);
			logger.info("Default branding applied.");
		}

		return result;
	});
