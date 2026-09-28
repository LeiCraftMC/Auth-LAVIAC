import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { UserAccountSettings } from "../lib/api/utils/shared-models/accountData";
import { SQLUtils } from "./utils";

/** @deprecated Use DB.Tables.sessions */
export const sessions = sqliteTable("sessions", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),
	hashed_token: text().notNull().unique(),
	zitadel_sub: text().notNull(),
	zitadel_email: text(),
	zitadel_name: text(),
	// cached for fast permission checks without a join; admins are re-checked at login
	user_role: text({ enum: UserAccountSettings.Roles }).default("member").notNull(),
	created_at: SQLUtils.getCreatedAtColumn(),
	expires_at: integer().notNull(),
});

/** @deprecated Use DB.Tables.auditLog */
export const auditLog = sqliteTable("audit_log", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),
	actor_sub: text().notNull(),
	action: text().notNull(),
	target_instance_id: text(),
	detail: text(),
	created_at: SQLUtils.getCreatedAtColumn(),
});

/** @deprecated Use DB.Tables.metadata — schemaless JSON key/value store. */
export const metadata = sqliteTable("metadata", {
	key: text().primaryKey(),
	data: text({ mode: "json" }).$type<Record<string, any> | Array<any>>().notNull(),
});
