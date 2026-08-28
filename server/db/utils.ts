/**
 * SQLUtils — dialect-aware Drizzle column helpers (SQLite / bun-sqlite).
 * Copied from Style-Guides shared/backend/sql-utils.ts. See docs/08-database.md.
 */
import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

export class SQLUtils {
	/** `created_at` column: unix-epoch milliseconds, non-null, defaulted to now. */
	static getCreatedAtColumn() {
		return integer("created_at", { mode: "number" }).notNull().default(sql`(unixepoch() * 1000)`);
	}

	/** Auto-incrementing integer primary key. */
	static primaryKeyIntAutoIncrement() {
		return integer("id").primaryKey({ autoIncrement: true });
	}

	/** Random opaque token column (e.g. session tokens), unique + indexed. */
	static tokenColumn(name = "token") {
		return text(name).notNull().unique();
	}
}
