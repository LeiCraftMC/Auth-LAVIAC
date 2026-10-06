import { count, desc, gt, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { ZitadelClient } from "../../../../../../zitadel/client";
import type { ZitadelInstance } from "../../../../../../zitadel/types";
import { ZitadelUsage } from "../../../../../../zitadel/usage";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../../utils/zitadel";
import { DOCS_TAGS } from "../../../docs";
import { AdminStatisticsModel } from "./model";

const DAY_MS = 24 * 60 * 60 * 1000;

type Statistics = AdminStatisticsModel.Get.Response;

/** `YYYY-MM` keys of the last `months` months (UTC), oldest first. */
function lastMonths(months: number) {
	const now = new Date();
	return Array.from({ length: months }, (_, i) => {
		const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
		return date.toISOString().slice(0, 7);
	});
}

/** `YYYY-MM-DD` keys of the last `days` days (UTC), oldest first. */
function lastDays(days: number) {
	const today = Date.now();
	return Array.from({ length: days }, (_, i) =>
		new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
	);
}

function countBy<T>(items: T[], key: (item: T) => string) {
	const counts = new Map<string, number>();
	for (const item of items) {
		counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	}
	return counts;
}

function instanceStatistics(instances: ZitadelInstance[]) {
	const createdPerMonth = countBy(
		instances.filter((i) => i.details?.creationDate),
		(i) => (i.details?.creationDate ?? "").slice(0, 7),
	);

	const newest = [...instances]
		.sort((a, b) => (b.details?.creationDate ?? "").localeCompare(a.details?.creationDate ?? ""))
		.slice(0, 5);

	const domains = instances.flatMap((i) => i.domains ?? []);

	return {
		instances: {
			total: instances.length,
			byState: [...countBy(instances, (i) => i.state)].map(([state, count]) => ({ state, count })),
			createdPerMonth: lastMonths(12).map((month) => ({
				month,
				count: createdPerMonth.get(month) ?? 0,
			})),
			versions: [...countBy(instances, (i) => i.version || "unknown")]
				.map(([version, count]) => ({ version, count }))
				.sort((a, b) => b.count - a.count),
			newest: newest.map((i) => ({
				id: i.id,
				name: i.name,
				state: i.state,
				createdAt: i.details?.creationDate ?? null,
			})),
		},
		domains: {
			total: domains.length,
			custom: domains.filter((d) => !d.generated).length,
			generated: domains.filter((d) => d.generated).length,
			instancesWithCustomDomain: instances.filter((i) => i.domains?.some((d) => !d.generated)).length,
		},
	} satisfies Pick<Statistics, "instances" | "domains">;
}

async function auditStatistics(): Promise<Statistics["audit"]> {
	const since = Date.now() - 30 * DAY_MS;
	const dayColumn = sql<string>`strftime('%Y-%m-%d', ${DB.Tables.auditLog.created_at} / 1000, 'unixepoch')`;

	const total = DB.instance().select({ value: count() }).from(DB.Tables.auditLog).get()?.value ?? 0;

	const perDayRows = DB.instance()
		.select({ day: dayColumn, count: count() })
		.from(DB.Tables.auditLog)
		.where(gte(DB.Tables.auditLog.created_at, since))
		.groupBy(dayColumn)
		.all();
	const perDay = new Map(perDayRows.map((row) => [row.day, row.count]));

	const topActions = DB.instance()
		.select({ action: DB.Tables.auditLog.action, count: count() })
		.from(DB.Tables.auditLog)
		.where(gte(DB.Tables.auditLog.created_at, since))
		.groupBy(DB.Tables.auditLog.action)
		.orderBy(desc(count()))
		.limit(6)
		.all();

	return {
		total,
		perDay: lastDays(30).map((day) => ({ day, count: perDay.get(day) ?? 0 })),
		topActions,
	};
}

export const router = new Hono().basePath("/statistics");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get statistics",
		description:
			"Cross-instance statistics (instances, states, versions, domains) plus LAVIAC's own activity (audit log, sessions, background tasks).",
		tags: [DOCS_TAGS.ADMIN_API.STATISTICS],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Statistics retrieved successfully", AdminStatisticsModel.Get.Response),
		),
	}),

	async (c) => {
		let zitadel: Pick<Statistics, "instances" | "domains"> = { instances: null, domains: null };
		let zitadelError: string | null = null;
		try {
			zitadel = instanceStatistics(await ZitadelClient.listInstances());
		} catch (err) {
			zitadelError = err instanceof Error ? err.message : String(err);
		}

		const activeSessions =
			DB.instance()
				.select({ value: count() })
				.from(DB.Tables.sessions)
				.where(gt(DB.Tables.sessions.expires_at, Date.now()))
				.get()?.value ?? 0;

		const taskCounts = new Map(
			DB.instance()
				.select({ status: DB.Tables.scheduled_tasks.status, count: count() })
				.from(DB.Tables.scheduled_tasks)
				.groupBy(DB.Tables.scheduled_tasks.status)
				.all()
				.map((row) => [row.status, row.count]),
		);

		return APIResponse.success(c, "Statistics retrieved successfully", {
			...zitadel,
			zitadelError,
			audit: await auditStatistics(),
			sessions: { active: activeSessions },
			tasks: {
				pending: (taskCounts.get("pending") ?? 0) + (taskCounts.get("paused") ?? 0),
				running: taskCounts.get("running") ?? 0,
				failed: taskCounts.get("failed") ?? 0,
				completed: taskCounts.get("completed") ?? 0,
			},
			generatedAt: Date.now(),
		} satisfies AdminStatisticsModel.Get.Response);
	},
);

router.get(
	"/usage",

	APIRouteSpec.authenticated({
		summary: "Get instance usage",
		description:
			"Org and user counts of every instance (instance-scoped Admin API calls, cached for 5 minutes). Needs the system user to hold IAM_OWNER through a System membership.",
		tags: [DOCS_TAGS.ADMIN_API.STATISTICS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Usage retrieved successfully", AdminStatisticsModel.Usage.Response),
		),
	}),

	zValidator("query", AdminStatisticsModel.Usage.Query),

	async (c) => {
		const { refresh } = c.req.valid("query");

		try {
			const usage = await ZitadelUsage.getAll(refresh === "true");
			const available = usage.items.filter((item) => item.error === null);

			return APIResponse.success(c, "Usage retrieved successfully", {
				...usage,
				totals: {
					orgs: available.reduce((sum, item) => sum + (item.orgs ?? 0), 0),
					users: available.reduce((sum, item) => sum + (item.users ?? 0), 0),
					unavailable: usage.items.length - available.length,
				},
			} satisfies AdminStatisticsModel.Usage.Response);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);
