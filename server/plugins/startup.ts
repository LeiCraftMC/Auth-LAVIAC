import { defineNitroPlugin } from "nitropack/runtime";
import { DB } from "../db";
import { API } from "../lib/api";
import { AuthHandler } from "../lib/api/utils/auth-handler";
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";

export default defineNitroPlugin(async () => {

	const config = await ConfigHandler.loadConfig();
	
	Logger.setLogLevel(config.LAVIAC_LOG_LEVEL ?? "info");
	
	Logger.log("Starting LAVIAC...");

	await DB.init(
		config.LAVIAC_DB_PATH ?? "./data/db.sqlite",
		config.LAVIAC_DB_AUTO_MIGRATE,
		config.LAVIAC_CONFIG_BASE_DIR ?? "./config"
	);

	await AuthHandler.cleanupExpired();

	await API.init(config.LAVIAC_API_DISABLE_DOCS === true);

	Logger.log("LAVIAC ready.");
});
