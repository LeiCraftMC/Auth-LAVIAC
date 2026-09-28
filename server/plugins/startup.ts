import { defineNitroPlugin } from "nitropack/runtime";
import { API } from "../lib/api";
import { DB } from "../lib/db";
import { ConfigHandler } from "../lib/utils/config";
import { AppConstants } from "../lib/utils/constants";
import { Logger } from "../lib/utils/logger";

// Runs once at Nitro boot — replaces Main.main() from the standalone backend shape.
export default defineNitroPlugin(async (nitroApp) => {
	const config = await ConfigHandler.loadConfig();

	Logger.setLogLevel(config.LOG_LEVEL);
	Logger.log(`Starting ${AppConstants.APP_NAME}...`);

	await DB.init(config.DB_PATH, config.DB_AUTO_MIGRATE, config.CONFIG_BASE_DIR);

	await API.init([config.APP_URL], config.API_DISABLE_DOCS === true);

	nitroApp.hooks.hook("close", async () => {
		try {
			Logger.log(`Received SIGTERM, shutting down...`);

			await API.stop();

			await DB.close();

			Logger.log("Shutdown complete, exiting.");
		} catch {
			Logger.critical("Error during shutdown, forcing exit");
		}
	});
});
