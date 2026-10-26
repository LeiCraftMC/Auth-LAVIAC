import { TaskHandler } from "@cleverjs/utils";
import { ZitadelClaims } from "../zitadel/claims";
import { ZitadelClient } from "../zitadel/client";
import type { ZitadelInstance } from "../zitadel/types";
import { ZitadelTaskSteps } from "./zitadelSteps";

export type SyncClaimsArgs = Record<string, never>;

/**
 * Keeps the claims webhook (server/lib/zitadel/claims.ts) in order on every running instance of
 * the Zitadel, provisioned by LAVIAC or not: adds LAVIAC's target where it is missing, points it
 * at the current webhook URL, replaces the legacy targets, or removes it with the claims off.
 * Queued at startup and every 6 hours (server/lib/utils/cron.ts). One instance's problem doesn't
 * stop the others; the task fails when any instance is not in order.
 */
export const SyncClaimsTask = new TaskHandler.StepBasedTaskFn(
	"syncClaims",
	async (_args: SyncClaimsArgs, logger, _state: Record<string, never>, isPaused) => {
		let instances: ZitadelInstance[] = [];
		const listed = await ZitadelTaskSteps.withRetries(
			"Listing the instances",
			logger,
			isPaused,
			async () => {
				instances = await ZitadelClient.listInstances();
			},
		);
		if (!listed.success || listed.paused) return listed;

		const failed: string[] = [];
		let synced = 0;
		for (const instance of instances) {
			const label = `${instance.name} (${instance.id})`;
			const host = ZitadelClient.getInstanceHost(instance);
			if (instance.state !== "STATE_RUNNING" || !host) {
				logger.info(`${label}: skipped, ${host ? instance.state : "it has no domain"}.`);
				continue;
			}

			const outcome: { problem: string | null } = { problem: null };
			const result = await ZitadelTaskSteps.withRetries(label, logger, isPaused, async () => {
				const sync = await ZitadelClaims.sync(instance.id, host);
				for (const change of sync.changes) logger.info(`${label}: ${change}.`);
				if (sync.changes.length === 0 && !sync.problem) logger.info(`${label}: in order.`);
				outcome.problem = sync.problem;
			});
			// A paused task runs again from the start; every write is idempotent.
			if (result.paused) return result;
			if (!result.success) {
				// withRetries logged the error.
				failed.push(label);
			} else if (outcome.problem) {
				logger.warn(`${label}: target left detached, ${outcome.problem}.`);
				failed.push(label);
			} else {
				synced++;
			}
		}

		return failed.length > 0
			? { success: false, message: `The claims webhook is not in order on ${failed.join(", ")}` }
			: { success: true, message: `The claims webhook is in order on ${synced} running instances` };
	},
);
