import { defineNitroPlugin } from "nitropack/runtime";
import { API } from "../lib/api";
import { SessionHandler } from "../lib/api/utils/authHandler";
import { DB } from "../lib/db";
import { ConfigHandler } from "../lib/utils/config";
import { Logger } from "../lib/utils/logger";

export default defineNitroPlugin(async () => {
	const config = await ConfigHandler.loadConfig();

	Logger.setLogLevel(config.LAVIAC_LOG_LEVEL ?? "info");

	Logger.log("Starting LAVIAC...");

	await DB.init(config.LAVIAC_DB_PATH ?? "./data/db.sqlite", config.LAVIAC_DB_AUTO_MIGRATE ?? true);

	await SessionHandler.cleanupExpired();

	await API.init(config.LAVIAC_API_DISABLE_DOCS === true);

	Logger.log("LAVIAC ready.");
});
