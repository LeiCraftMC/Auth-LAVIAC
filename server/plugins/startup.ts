/**
 * Nitro startup plugin — replaces Main.main() for the full-stack Nuxt shape.
 * Runs once at boot: load config → set log level → init DB → init API.
 * See Style-Guides docs/04 (Mounting Hono in Nitro).
 */
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

	DB.init(config.LAVIAC_DB_PATH ?? "./data/laviac.sqlite", config.LAVIAC_DB_AUTO_MIGRATE ?? true);
	await AuthHandler.cleanupExpired();
	await API.init(config.LAVIAC_API_DISABLE_DOCS === true);

	Logger.log("LAVIAC ready.");
});
