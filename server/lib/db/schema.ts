import type { TaskHandler } from "@cleverjs/utils";
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { UserAccountSettings } from "../api/utils/shared-models/accountData";
import { InstanceTemplates } from "../zitadel/templates";
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

/**
 * @deprecated Use DB.Tables.scheduled_tasks to access this table.
 */
export const scheduled_tasks = sqliteTable("scheduled_tasks", {
	id: integer().primaryKey({ autoIncrement: true }),
	function: text().notNull(),
	// LAVIAC has no local users table — the actor is the session's `user_sub`.
	created_by_user_sub: text(),
	args: text({ mode: "json" }).$type<Record<string, any>>().notNull(),
	autoDelete: integer({ mode: "boolean" }).notNull().default(sql`0`),
	storeLogs: integer({ mode: "boolean" }).notNull().default(sql`0`),
	status: text({ enum: ["pending", "running", "paused", "failed", "completed"] })
		.notNull()
		.default("pending"),
	created_at: integer().notNull(),
	finished_at: integer(),
	result: text({ mode: "json" }).$type<Record<string, any>>(),
	message: text(),
});

/**
 * @deprecated Use DB.Tables.scheduled_tasks_paused_state to access this table.
 */
export const scheduled_tasks_paused_state = sqliteTable("scheduled_tasks_paused_state", {
	task_id: integer()
		.primaryKey()
		.references(() => scheduled_tasks.id, { onDelete: "cascade" }),
	next_step_to_execute: integer().notNull(),
	data: text({ mode: "json" }).$type<TaskHandler.TempPausedTaskState["data"]>().notNull(),
});

/**
 * Host VM samples, written every minute by the cron job (server/lib/utils/cron.ts) and pruned
 * after `HostMetrics.RETENTION_DAYS`. Byte counts are bytes; usage values are percentages.
 * @deprecated Use DB.Tables.hostMetrics to access this table.
 */
export const hostMetrics = sqliteTable("host_metrics", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),
	cpu_usage: real(),
	load_1: real().notNull(),
	mem_total: integer().notNull(),
	mem_used: integer().notNull(),
	swap_total: integer().notNull(),
	swap_used: integer().notNull(),
	disk_total: integer(),
	disk_used: integer(),
	created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * The template a virtual instance was created with (server/lib/zitadel/templates.ts) and the orgs
 * the `provisionInstance` task found or created. Instances created before templates have no row.
 * @deprecated Use DB.Tables.instanceSetups to access this table.
 */
export const instanceSetups = sqliteTable("instance_setups", {
	instance_id: text().primaryKey(),
	template: text({ enum: InstanceTemplates.IDS }).notNull(),
	options: text({ mode: "json" }).$type<InstanceTemplates.Options>().notNull(),
	system_org_id: text(),
	home_org_id: text(),
	created_by_user_sub: text(),
	created_at: SQLUtils.getCreatedAtColumn(),
});

/** @deprecated Use DB.Tables.metadata — schemaless JSON key/value store. */
export const metadata = sqliteTable("metadata", {
	key: text().primaryKey(),
	data: text({ mode: "json" }).$type<Record<string, any> | Array<any>>().notNull(),
});
