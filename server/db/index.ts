/**
 * DB — static Drizzle/SQLite singleton.
 * Copied from the backend-service template's src/db/index.ts. See docs/08-database.md.
 */
import { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Logger } from "../utils/logger";
import * as schema from "./schema";

type DBInstance = BunSQLiteDatabase<typeof schema>;

export class DB {
	private static db: DBInstance | null = null;
	private static client: Database | null = null;

	static init(path: string, autoMigrate: boolean) {
		DB.client = new Database(path);
		DB.db = drizzle({ client: DB.client, schema });
		Logger.log("Database initialized.");
		if (autoMigrate) {
			DB.migrate();
		}
	}

	static instance() {
		if (!DB.db) throw new Error("DB not initialised");
		return DB.db;
	}

	static migrate() {
		if (!DB.db) throw new Error("DB not initialised");
		migrate(DB.db, { migrationsFolder: "./drizzle" });
		Logger.log("Database migrations applied.");
	}

	static close() {
		DB.client?.close();
		DB.client = null;
		DB.db = null;
	}
}

export namespace DB {
	export namespace Schema {
		export const sessions = schema.sessions;
		export const auditLog = schema.auditLog;
	}
	export namespace Models {
		export type Session = typeof DB.Schema.sessions.$inferSelect;
		export type NewSession = typeof DB.Schema.sessions.$inferInsert;
		export type AuditLog = typeof DB.Schema.auditLog.$inferSelect;
		export type NewAuditLog = typeof DB.Schema.auditLog.$inferInsert;
	}
}
