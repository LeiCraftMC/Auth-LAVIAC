/// <reference types="bun-types" />

import { afterAll, beforeAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { API } from "../../server/lib/api";
import { DB } from "../../server/lib/db";
import { ConfigHandler, type ENVConfigLike } from "../../server/lib/utils/config";

/** Password of the static fallback admin in the test env (hashed once with Bun.password). */
export const STATIC_AUTH_TEST_PASSWORD = "static-auth-test-password";
const STATIC_AUTH_TEST_HASH = await Bun.password.hash(STATIC_AUTH_TEST_PASSWORD);

function setTestEnv(rootDir: string) {
	const envVars = {
		LAVIAC_LOG_LEVEL: "debug",

		LAVIAC_API_DISABLE_DOCS: false,

		LAVIAC_DB_PATH: path.join(rootDir, "db.sqlite"),
		LAVIAC_DB_AUTO_MIGRATE: true,
		LAVIAC_DB_MIGRATION_DIR: "./drizzle/migrations",

		LAVIAC_LOG_DIR: path.join(rootDir, "logs"),
		LAVIAC_CONFIG_BASE_DIR: rootDir,

		LAVIAC_APP_URL: "http://localhost:12191",

		// No Zitadel in the test env: the System API is unconfigured, so Zitadel-backed routes
		// report their upstream error and the default branding is never queued.
		LAVIAC_ZITADEL_APPLY_DEFAULT_BRANDING: false,

		LAVIAC_STATIC_AUTH_USERNAME: "admin",
		LAVIAC_STATIC_AUTH_PASSWORD_HASH: STATIC_AUTH_TEST_HASH,

		LAVIAC_HOST_ROOT: "/",
	} as const satisfies Partial<ENVConfigLike>;

	for (const [key, value] of Object.entries(envVars)) {
		process.env[key] = String(value);
	}
}

async function createIsolatedDataDir(): Promise<string> {
	const root = await fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
	return root;
}

/**
 * On Windows, file handles (e.g. the SQLite DB file) can take a moment to be
 * released after closing, making an immediate recursive removal flaky (EBUSY).
 * Retries manually since Bun's `fs.rm` doesn't reliably honor `maxRetries`/`retryDelay`.
 */
async function removeDirWithRetry(dir: string, attempts = 10, delayMs = 300) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await fs.rm(dir, { recursive: true, force: true });
			return;
		} catch (err: any) {
			if (
				attempt === attempts ||
				(err?.code !== "EBUSY" && err?.code !== "ENOTEMPTY" && err?.code !== "EPERM")
			) {
				console.error(`Failed to remove directory ${dir} on attempt ${attempt}:`, err);
			}
			await Bun.sleep(delayMs);
		}
	}
}

let TMP_ROOT: string | null = null;

beforeAll(async () => {
	TMP_ROOT = await createIsolatedDataDir();

	setTestEnv(TMP_ROOT);

	const config = await ConfigHandler.loadConfig();

	await DB.init(path.join(TMP_ROOT, "db.sqlite"), true, TMP_ROOT, "./drizzle/migrations");

	await API.init([config.APP_URL], false);
});

afterAll(async () => {
	await API.stop();

	await DB.close();

	if (TMP_ROOT) {
		await removeDirWithRetry(TMP_ROOT);
	}
});
