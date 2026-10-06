import type { CronJob as BunCronJob } from "bun";
import { HostMetrics } from "../host/metrics";
import { OSUpdates } from "../host/updates";
import { TaskScheduler } from "../tasks";
import { ZitadelReleases } from "../zitadel/releases";
import { Logger } from "./logger";

class CronJob {
	private _job: BunCronJob | null = null;

	constructor(
		private readonly cronExpression: string,
		private readonly callback: () => Promise<void>,
	) {}

	start() {
		// A rejected Bun.cron callback ends the process — log job failures instead.
		this._job = Bun.cron(this.cronExpression, async () => {
			try {
				await this.callback();
			} catch (err) {
				Logger.error(`Cron job "${this.cronExpression}" failed:`, err);
			}
		});
	}

	async stop() {
		if (this._job) {
			await this._job.stop();
		}
	}
}

export class CronJobHandler {
	private static jobs: CronJob[] = [];
	private static initialized: boolean = false;

	static async init() {
		if (this.initialized) return;
		this.initialized = true;

		this.jobs.push(
			// Sample the host VM for the System page charts.
			new CronJob("* * * * *", async () => {
				await HostMetrics.sample();
			}),

			// Housekeeping: old metric samples and finished auto-delete tasks.
			new CronJob("17 * * * *", async () => {
				await HostMetrics.prune();
				await TaskScheduler.deleteOldCompletedTasks(24 * 7);
			}),

			// Refresh the OS package and Zitadel release checks (both cache their results).
			new CronJob("23 */6 * * *", async () => {
				await OSUpdates.check();
				await ZitadelReleases.check();
			}),
		);
	}

	static async startAll() {
		if (!this.initialized) {
			await this.init();
		}
		for (const job of this.jobs) {
			job.start();
		}
	}

	static async stopAll() {
		for (const job of this.jobs) {
			await job.stop();
		}
	}
}
