import { and, asc, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminAuditModel } from "./model";

export const router = new Hono().basePath("/audit");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List audit log entries",
		description:
			"Every LAVIAC action (logins, instance/domain/limit changes, branding, update checks, session revocations), newest first by default.",
		tags: [DOCS_TAGS.ADMIN_API.AUDIT_LOG],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Audit log retrieved successfully", AdminAuditModel.GetAll.Response),
		),
	}),

	zValidator("query", AdminAuditModel.GetAll.Query),

	async (c) => {
		const filters = c.req.valid("query");
		const table = DB.Tables.auditLog;

		const predicates: SQL[] = [];
		if (filters.action) predicates.push(eq(table.action, filters.action));
		if (filters.instanceId) predicates.push(eq(table.target_instance_id, filters.instanceId));
		if (filters.searchString) {
			const pattern = `%${filters.searchString}%`;
			const search = or(
				like(table.actor_sub, pattern),
				like(table.action, pattern),
				like(table.target_instance_id, pattern),
				like(table.detail, pattern),
			);
			if (search) predicates.push(search);
		}
		const predicate = predicates.length > 0 ? and(...predicates) : undefined;

		const total =
			DB.instance().select({ value: count() }).from(table).where(predicate).get()?.value ?? 0;

		const items = DB.instance()
			.select()
			.from(table)
			.where(predicate)
			.orderBy(filters.order === "oldest" ? asc(table.id) : desc(table.id))
			.limit(filters.limit)
			.offset(filters.offset)
			.all();

		return APIResponse.success(c, "Audit log retrieved successfully", {
			total,
			items,
		} satisfies AdminAuditModel.GetAll.Response);
	},
);
