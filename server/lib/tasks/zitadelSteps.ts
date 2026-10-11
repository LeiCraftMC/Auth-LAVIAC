import type { TaskHandler } from "@cleverjs/utils";
import { ZitadelApiError, ZitadelClient } from "../zitadel/client";

type TaskLogger = TaskHandler.BasicTaskLoggerLike;
type PausedRef = Parameters<TaskHandler.SubTaskStepFn>[3];

// A freshly created instance becomes addressable a few seconds after `_create` returns (Zitadel's
// projections catch up asynchronously), so transient failures are retried for about a minute and
// a half. The window is measured in time, not attempts: a request that hangs until the client's
// 30 s timeout must not stretch it to many minutes.
const RETRY_WINDOW_MS = 90_000;
const RETRY_DELAY_MS = 3000;

// Client errors that retrying cannot fix.
const PERMANENT_STATUSES = [400, 401, 403];

// Zitadel's English texts for a write that changes nothing (internal/static/i18n/en.yaml):
// "… not changed", "… has not been changed", "No changes" (Errors.NoChangesFound, e.g. the
// security policy and the OIDC settings) and "No changes found".
const NOT_CHANGED_PATTERN = /not (been )?changed|NotChanged|no changes|NoChangesFound/i;

/** Retry helpers for the task steps that call an instance's Zitadel APIs. */
export class ZitadelTaskSteps {
	/** Zitadel rejects writing a policy that equals the stored one — that is a success here. */
	static isNotChangedError(err: unknown) {
		return err instanceof ZitadelApiError && NOT_CHANGED_PATTERN.test(err.message);
	}

	static isStatus(err: unknown, status: number) {
		return err instanceof ZitadelApiError && err.status === status;
	}

	/** The host to address a running instance with; throws (to be retried) until it runs. */
	static async runningInstanceHost(instanceId: string): Promise<string> {
		const instance = await ZitadelClient.getInstance(instanceId);
		if (instance.state !== "STATE_RUNNING") {
			throw new Error(`Instance is ${instance.state}, waiting for STATE_RUNNING`);
		}

		const domain = ZitadelClient.getInstanceHost(instance);
		if (!domain) {
			throw new Error("Instance has no domain yet");
		}
		return domain;
	}

	static describeError(err: unknown) {
		if (err instanceof ZitadelApiError && err.status === 403) {
			return `${err.message} — the system user needs IAM_OWNER through a "System" membership in SystemAPIUsers`;
		}
		return err instanceof Error ? err.message : String(err);
	}

	/**
	 * Run `fn`, retrying transient failures (timeouts, 404 and 5xx while the instance becomes
	 * addressable) for up to {@link RETRY_WINDOW_MS}. "Not changed" counts as success;
	 * 400/401/403 fail at once.
	 */
	static async withRetries(
		label: string,
		logger: TaskLogger,
		isPaused: PausedRef,
		fn: () => Promise<void>,
	): Promise<TaskHandler.StepBasedTaskReturn> {
		const deadline = Date.now() + RETRY_WINDOW_MS;
		for (let attempt = 1; ; attempt++) {
			if (isPaused.getV()) {
				return { success: true, paused: true };
			}

			try {
				await fn();
				return { success: true };
			} catch (err) {
				if (ZitadelTaskSteps.isNotChangedError(err)) {
					logger.info(`${label}: already up to date.`);
					return { success: true };
				}

				const permanent = err instanceof ZitadelApiError && PERMANENT_STATUSES.includes(err.status);
				if (permanent || Date.now() + RETRY_DELAY_MS >= deadline) {
					const suffix = permanent ? "" : ` (gave up after ${attempt} attempts)`;
					logger.error(`${label} failed${suffix}: ${ZitadelTaskSteps.describeError(err)}`);
					return {
						success: false,
						message: `${label} failed${suffix}: ${ZitadelTaskSteps.describeError(err)}`,
					};
				}

				logger.warn(
					`${label} failed (attempt ${attempt}): ${ZitadelTaskSteps.describeError(err)} — retrying.`,
				);
				await Bun.sleep(RETRY_DELAY_MS);
			}
		}
	}
}
