import { defineNitroPlugin, useStorage } from "nitropack/runtime";
import { API } from "../lib/api";
import { DB } from "../lib/db";
import { TaskScheduler } from "../lib/tasks";
import { Utils } from "../lib/utils";
import { ConfigHandler } from "../lib/utils/config";
import { AppConstants } from "../lib/utils/constants";
import { CronJobHandler } from "../lib/utils/cron";
import { Logger } from "../lib/utils/logger";
import { ZitadelBranding } from "../lib/zitadel/branding";

// Runs once at Nitro boot — replaces Main.main() from the standalone backend shape.
export default defineNitroPlugin(async (nitroApp) => {
	const config = await ConfigHandler.loadConfig();

	Logger.setLogLevel(config.LOG_LEVEL ?? "info");
	Logger.log(`Starting ${AppConstants.APP_NAME}...`);

	await DB.init(
		config.DB_PATH,
		config.DB_AUTO_MIGRATE,
		config.CONFIG_BASE_DIR,
		config.DB_MIGRATION_DIR,
	);

	await Utils.ensureDirectoryExists(config.LOG_DIR ?? "./data/logs");

	// The default-branding font is a Nitro server asset (server/assets/branding/), bundled into
	// .output/ by the build — only Nitro can read it, so the loader is registered here.
	ZitadelBranding.setFontLoader(async () => {
		const font = await useStorage("assets:server").getItemRaw<Uint8Array>(
			ZitadelBranding.FONT.assetKey,
		);
		return font ? new Uint8Array(font) : null;
	});
	const font = await ZitadelBranding.loadFont();
	if (font) {
		Logger.info(`Default branding font loaded (${font.byteLength} bytes).`);
	} else {
		Logger.warn("Default branding font missing — new instances get the colors and theme only.");
	}

	// LAVIAC divergence: not awaited — the queue may hold branding tasks that retry against
	// Zitadel for up to a minute, which must not hold back the API (it answers 503 until init).
	// (`processQueue` never rejects — see server/lib/tasks/index.ts.)
	void TaskScheduler.processQueue();

	await CronJobHandler.init();
	await CronJobHandler.startAll();

	await API.init([config.APP_URL], config.API_DISABLE_DOCS === true);

	let shuttingDown = false;
	async function shutdown(reason: string) {
		if (shuttingDown) return;
		shuttingDown = true;

		try {
			Logger.log(`Received ${reason}, shutting down...`);

			await CronJobHandler.stopAll();

			await API.stop();

			await TaskScheduler.stopProcessing();

			await DB.close();

			Logger.log("Shutdown complete, exiting.");
		} catch {
			Logger.critical("Error during shutdown, forcing exit");
		}
	}

	nitroApp.hooks.hook("close", () => shutdown("close"));

	// LAVIAC divergence: the Bun preset's server entry installs no signal handlers and never calls
	// the `close` hook, so without these `docker stop` would kill running tasks mid-step and skip
	// closing the DB. Uncaught errors are handled like the backend template's `Main`.
	if (!import.meta.dev) {
		for (const signal of ["SIGTERM", "SIGINT"] as const) {
			process.once(signal, async () => {
				await shutdown(signal);
				process.exit(0);
			});
		}

		process.on("uncaughtException", async (error) => {
			Logger.critical(`Uncaught Exception:
${error.stack ?? error.message}`);
			await shutdown("uncaughtException");
			process.exit(1);
		});

		process.on("unhandledRejection", async (reason) => {
			Logger.critical(
				`Unhandled Rejection:
${reason instanceof Error ? (reason.stack ?? reason.message) : reason}`,
			);
			await shutdown("unhandledRejection");
			process.exit(1);
		});
	}
});
