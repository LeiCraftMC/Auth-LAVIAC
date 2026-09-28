import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { UserAccountSettings } from "../api/utils/shared-models/accountData";
import { SQLUtils } from "./utils";

/** @deprecated Use DB.Tables.sessions */
export const sessions = sqliteTable("sessions", {
	// Opaque bearer-token id (32 random bytes hex) — the row primary key, so the
	// lookup on every request is O(1). See docs/10-auth.md.
	id: text().primaryKey(),
	// Bun.password hash of the token base — the base is never persisted in plaintext.
	hashed_token: text().notNull(),
	// Zitadel `sub` (OIDC login) or the configured username (static fallback login).
	user_sub: text().notNull(),
	user_email: text(),
	user_name: text(),
	// cached for fast permission checks without a join; admins are re-checked at login
	user_role: text({ enum: UserAccountSettings.Roles }).default("member").notNull(),
	login_method: text({ enum: UserAccountSettings.LoginMethods }).notNull(),
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
