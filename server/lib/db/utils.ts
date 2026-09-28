import { type entityKind, sql } from "drizzle-orm";
import type { drizzle as drizzle_bun } from "drizzle-orm/bun-sqlite";
import { BaseSQLiteDatabase, integer } from "drizzle-orm/sqlite-core";

export declare class DrizzleDB extends BaseSQLiteDatabase<
	"async" | "sync",
	void,
	Record<string, never>
> {
	static readonly [entityKind]: string;
	$client?: any;
	batch?: any;
}

export namespace DrizzleDB {
	/** Concrete `drizzle-orm/bun-sqlite` instance type. */
	export type BunSQLite = ReturnType<typeof drizzle_bun>;
}

export namespace SQLUtils {
	/** `created_at` column: unix-epoch milliseconds, non-null, defaulted to now. */
	export function getCreatedAtColumn(name: string = "created_at") {
		return integer(name, { mode: "number" }).notNull().default(sql`(unixepoch() * 1000)`);
	}

	/** Auto-incrementing integer primary key named `name` (default `"id"`). */
	export function primaryKeyIntAutoIncrement(name: string = "id") {
		return integer(name).primaryKey({ autoIncrement: true });
	}
}
