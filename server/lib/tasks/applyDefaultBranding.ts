import { TaskHandler } from "@cleverjs/utils";
import { Audit } from "../utils/audit";
import { ZitadelBranding } from "../zitadel/branding";
import { ZitadelClient } from "../zitadel/client";
import { ZitadelTaskSteps } from "./zitadelSteps";

export type ApplyDefaultBrandingArgs = {
	instanceId: string;
	/** `user_sub` of the session that triggered the task — recorded in the audit log. */
	actorSub: string;
};

type ApplyDefaultBrandingState = {
	instanceHost?: string;
};

const withRetries = ZitadelTaskSteps.withRetries;

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
			const domain = await ZitadelTaskSteps.runningInstanceHost(args.instanceId);
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
