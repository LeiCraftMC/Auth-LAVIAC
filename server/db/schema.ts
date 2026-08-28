/**
 * DB schema — sessions (OIDC admin sessions) + audit_log (instance management actions).
 * See docs/08-database.md.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SQLUtils } from "./utils";

/** An admin OIDC session. The opaque `token` is the bearer credential in the session cookie. */
export const sessions = sqliteTable("sessions", {
	id: SQLUtils.primaryKeyIntAutoIncrement(),
	token: SQLUtils.tokenColumn(),
	zitadelSub: text("zitadel_sub").notNull(),
	zitadelEmail: text("zitadel_email"),
	zitadelName: text("zitadel_name"),
	isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
	createdAt: SQLUtils.getCreatedAtColumn(),
	expiresAt: integer("expires_at", { mode: "number" }).notNull(),
});

/** Audit trail of privileged instance-management actions performed via LAVIAC. */
export const auditLog = sqliteTable("audit_log", {
	id: SQLUtils.primaryKeyIntAutoIncrement(),
	actorSub: text("actor_sub").notNull(),
	action: text("action").notNull(),
	targetInstanceId: text("target_instance_id"),
	detail: text("detail"),
	createdAt: SQLUtils.getCreatedAtColumn(),
});
