/**
 * DB — static Drizzle/SQLite singleton. Tables are exposed through `DB.Tables`, row types
 * through `DB.Models`. No initial-admin bootstrap here: LAVIAC admins sign in via Zitadel
 * OIDC and are authorized by the project role (see AGENTS.md).
 * See Style-Guides docs/08-database.md.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Logger } from "../utils/logger";
import * as TableSchema from "./schema";
import type { DrizzleDB } from "./utils";

export class DB {

    protected static db: DrizzleDB;

    static async init(
        path: string,
        autoMigrate: boolean = false,
    ) {
		
		if (path !== ":memory:") {
			await mkdir(dirname(path), { recursive: true });
		}

		this.db = drizzle(path);
		if (autoMigrate) {
			Logger.info("Running database migrations...");
			await migrate(DB.db as DrizzleDB.BunSQLite, { migrationsFolder: "drizzle" });
			Logger.info("Database migrations completed.");
		}

		Logger.info(`Database initialized at ${path}`);
	}

	static instance(): DrizzleDB {
		if (!this.db) {
			throw new Error("Database not initialized. Call DB.init() first.");
		}
		return this.db;
	}

	static async close() {
		if (!this.db) return;

		Logger.info("Database connection closed.");
		this.db.$client.close();
		await Bun.sleep(500); // let the file handle flush on Windows
	}
}

export namespace DB.Tables {
	export const sessions = TableSchema.sessions;
	export const auditLog = TableSchema.auditLog;
	export const metadata = TableSchema.metadata;
}

export namespace DB.Models {
	export type Session = typeof DB.Tables.sessions.$inferSelect;
	export type AuditLog = typeof DB.Tables.auditLog.$inferSelect;
	export type Metadata = typeof DB.Tables.metadata.$inferSelect;
}
