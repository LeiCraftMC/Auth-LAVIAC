import type { TaskHandler } from "@cleverjs/utils";
import { ZitadelApiError, ZitadelClient } from "../zitadel/client";

type TaskLogger = TaskHandler.BasicTaskLoggerLike;
type PausedRef = Parameters<TaskHandler.SubTaskStepFn>[3];

// A freshly created instance becomes addressable a few seconds after `_create` returns (Zitadel's
// projections catch up asynchronously), so transient failures are retried for about a minute.
const RETRY_ATTEMPTS = 20;
const RETRY_DELAY_MS = 3000;

// Client errors that retrying cannot fix.
const PERMANENT_STATUSES = [400, 401, 403];

/** Retry helpers for the task steps that call an instance's Zitadel APIs. */
export class ZitadelTaskSteps {
	/** Zitadel rejects writing a policy that equals the stored one — that is a success here. */
	static isNotChangedError(err: unknown) {
		return err instanceof ZitadelApiError && /not (been )?changed|NotChanged/i.test(err.message);
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
	 * Run `fn`, retrying transient failures (404 and 5xx while the instance becomes addressable).
	 * "Not changed" counts as success; 400/401/403 fail at once.
	 */
	static async withRetries(
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
				if (ZitadelTaskSteps.isNotChangedError(err)) {
					logger.info(`${label}: already up to date.`);
					return { success: true };
				}

				const permanent = err instanceof ZitadelApiError && PERMANENT_STATUSES.includes(err.status);
				if (permanent || attempt >= RETRY_ATTEMPTS) {
					logger.error(`${label} failed: ${ZitadelTaskSteps.describeError(err)}`);
					return {
						success: false,
						message: `${label} failed: ${ZitadelTaskSteps.describeError(err)}`,
					};
				}

				logger.warn(
					`${label} failed (attempt ${attempt}/${RETRY_ATTEMPTS}): ${ZitadelTaskSteps.describeError(err)} — retrying.`,
				);
				await Bun.sleep(RETRY_DELAY_MS);
			}
		}
	}
}
