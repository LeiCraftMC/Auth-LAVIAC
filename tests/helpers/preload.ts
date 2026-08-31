/// <reference types="bun-types" />
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll } from "bun:test";
import { API } from "../../server/lib/api";
import { DB } from "../../server/db";
import { ConfigHandler, type ParsedConfig } from "../../server/utils/config";

function setTestEnv(rootDir: string) {
	const envVars = {
		LAVIAC_LOG_LEVEL: "debug",
		LAVIAC_APP_URL: "http://localhost:12400",
		LAVIAC_API_DISABLE_DOCS: true,
		LAVIAC_DB_PATH: path.join(rootDir, "db.sqlite"),
		LAVIAC_DB_AUTO_MIGRATE: true,
		LAVIAC_CONFIG_BASE_DIR: rootDir,
	} as const satisfies Partial<ParsedConfig>;

	for (const [key, value] of Object.entries(envVars)) {
		process.env[key] = String(value);
	}
}

async function createIsolatedDataDir(): Promise<string> {
	return fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
}

/**
 * On Windows, file handles (e.g. the SQLite DB file) can take a moment to be released
 * after closing, making an immediate recursive removal flaky (EBUSY). Retries manually
 * since Bun's `fs.rm` doesn't reliably honor `maxRetries`/`retryDelay`.
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
				throw err;
			}
			await Bun.sleep(delayMs);
		}
	}
}

let TMP_ROOT: string | null = null;

beforeAll(async () => {
	TMP_ROOT = await createIsolatedDataDir();
	setTestEnv(TMP_ROOT);
	await ConfigHandler.loadConfig();
	await DB.init(path.join(TMP_ROOT, "db.sqlite"), true);
	await API.init(true); // disable docs for the test harness
});

afterAll(async () => {
	await DB.close();
	if (TMP_ROOT) {
		await removeDirWithRetry(TMP_ROOT);
	}
});