import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdir as fs_mkdir } from "fs/promises";
import { dirname as path_dirname, join as path_join } from "path";
import { Logger } from "../utils/logger";
import * as TableSchema from "./schema";
import type { DrizzleDB } from "./utils";

export class DB {
	protected static db: DrizzleDB.BunSQLite;

	static async init(
		path: string,
		autoMigrate: boolean,
		configBaseDir: string,
		migrationsFolder: string,
	) {
		await fs_mkdir(path_dirname(path), { recursive: true });
		await fs_mkdir(configBaseDir, { recursive: true });

		this.db = drizzle(path);
		if (autoMigrate) {
			Logger.info("Running database migrations...");

			if (Bun?.isStandaloneExecutable) {
				// `bun build --compile --asset ./drizzle/migrations` embeds the files as `migrations/...`
				// next to the entry (`/$bunfs/root/migrations` on Linux) — without the `drizzle/` segment.
				migrationsFolder = path_join(import.meta.dir, "migrations");
			}

			await migrate(this.db, { migrationsFolder });

			Logger.info("Database migrations completed.");
		}

		// No initial-admin bootstrap here: LAVIAC admins sign in via Zitadel OIDC
		// (or the env-based static fallback) — see AGENTS.md. The guide's
		// createInitialAdminUserIfNeeded pattern does not apply.

		Logger.info(`Database initialized at ${path}`);
	}

	static instance() {
		if (!this.db) {
			throw new Error("Database not initialized. Call DB.init() first.");
		}
		return DB.db;
	}

	static async close() {
		if (!this.db) return;

		Logger.info("Database connection closed.");
		await this.db.$client.close();

		// `close()` calls sqlite3_close_v2, which defers releasing the OS file
		// handle until any unfinalized prepared statements are garbage collected.
		// Force that now so the underlying file is actually free (e.g. for tests
		// that remove the DB file/directory right after closing).
		Bun.gc(true);
		await Bun.sleep(500);
	}
}

export namespace DB.Tables {
	export const sessions = TableSchema.sessions;
	export const auditLog = TableSchema.auditLog;
	export const scheduled_tasks = TableSchema.scheduled_tasks;
	export const scheduled_tasks_paused_state = TableSchema.scheduled_tasks_paused_state;
	export const hostMetrics = TableSchema.hostMetrics;
	export const metadata = TableSchema.metadata;
}

export namespace DB.Models {
	export type Session = typeof DB.Tables.sessions.$inferSelect;
	export type AuditLog = typeof DB.Tables.auditLog.$inferSelect;
	export type ScheduledTask = typeof DB.Tables.scheduled_tasks.$inferSelect;
	export type ScheduledTaskPausedState = typeof DB.Tables.scheduled_tasks_paused_state.$inferSelect;
	export type HostMetric = typeof DB.Tables.hostMetrics.$inferSelect;
	export type Metadata = typeof DB.Tables.metadata.$inferSelect;
}
