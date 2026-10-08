import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { TaskScheduler } from "../../../../../../tasks";
import { ZitadelApiError, ZitadelClient } from "../../../../../../zitadel/client";
import { InstanceTemplates } from "../../../../../../zitadel/templates";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler } from "../../../../../utils/authHandler";
import { TaskData } from "../../../../../utils/shared-models/taskData";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../../utils/zitadel";
import { DOCS_TAGS } from "../../../docs";
import { InstancesModel } from "../model";
import { InstanceTemplateModel } from "./model";

export const router = new Hono().basePath("/template");

function getSetup(instanceId: string) {
	return DB.instance()
		.select()
		.from(DB.Tables.instanceSetups)
		.where(eq(DB.Tables.instanceSetups.instance_id, instanceId))
		.get();
}

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get the instance's template",
		description:
			"The template the instance was created with, the settings it applied, the instance's current default org (read live from Zitadel) and the latest provisioning task.",
		tags: [DOCS_TAGS.INSTANCES_TEMPLATE],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Template retrieved successfully", InstanceTemplateModel.Get.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		let instanceHost: string | null;
		try {
			instanceHost = ZitadelClient.getInstanceHost(await ZitadelClient.getInstance(instanceId));
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		let defaultOrg: InstanceTemplateModel.Get.Response["defaultOrg"] = null;
		let error: string | null = instanceHost ? null : "The instance has no domain yet";
		if (instanceHost) {
			try {
				const org = await ZitadelClient.getDefaultOrg(instanceHost);
				defaultOrg = org ? { id: org.id, name: org.name ?? null } : null;
			} catch (err) {
				error =
					err instanceof ZitadelApiError && err.status === 403
						? "Forbidden — the system user needs IAM_OWNER through a System membership"
						: err instanceof Error
							? err.message
							: String(err);
			}
		}

		const setup = getSetup(instanceId);

		const lastTask = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(
				and(
					eq(DB.Tables.scheduled_tasks.function, "provisionInstance"),
					sql`json_extract(${DB.Tables.scheduled_tasks.args}, '$.instanceId') = ${instanceId}`,
				),
			)
			.orderBy(desc(DB.Tables.scheduled_tasks.id))
			.get();

		return APIResponse.success(c, "Template retrieved successfully", {
			setup: setup
				? {
						template: InstanceTemplates.definition(setup.template),
						options: setup.options,
						systemOrgId: setup.system_org_id,
						homeOrgId: setup.home_org_id,
						createdAt: setup.created_at,
						createdBySub: setup.created_by_user_sub,
						sections: InstanceTemplates.describe(setup.template, setup.options),
					}
				: null,
			defaultOrg,
			error,
			lastTask: lastTask ? TaskData.Task.parse(lastTask) : null,
		} satisfies InstanceTemplateModel.Get.Response);
	},
);

router.post(
	"/_apply",

	APIRouteSpec.authenticated({
		summary: "Re-apply the instance's template",
		description:
			"Queue a background task that applies the instance's template again: the SYSTEM org lockdown, the instance defaults, the home org and the default org. Settings changed by hand since are overwritten.",
		tags: [DOCS_TAGS.INSTANCES_TEMPLATE],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.accepted("Template queued successfully", InstanceTemplateModel.Apply.Response),
			APIResponseSpec.notFound("Instance not found, or it was created before templates"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		if (!getSetup(instanceId)) {
			return APIResponse.notFound(c, "This instance was created before templates");
		}

		try {
			await ZitadelClient.getInstance(instanceId);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		const taskId = await TaskScheduler.enqueueTask(
			"provisionInstance",
			{ instanceId, actorSub: authContext.user_sub },
			{ created_by_user_sub: authContext.user_sub },
			{ storeLogs: true },
		);

		return APIResponse.accepted(c, "Template queued successfully", {
			taskId,
		} satisfies InstanceTemplateModel.Apply.Response);
	},
);
