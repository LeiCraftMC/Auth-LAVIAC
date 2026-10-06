import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { TaskScheduler } from "../../../../../../tasks";
import { ZitadelBranding } from "../../../../../../zitadel/branding";
import { ZitadelApiError, ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler } from "../../../../../utils/authHandler";
import { TaskData } from "../../../../../utils/shared-models/taskData";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../../utils/zitadel";
import { DOCS_TAGS } from "../../../docs";
import { InstancesModel } from "../model";
import { InstanceBrandingModel } from "./model";

export const router = new Hono().basePath("/branding");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get instance branding",
		description:
			"The instance's active label policy (Admin API), the LAVIAC default branding, and the latest default-branding task of the instance.",
		tags: [DOCS_TAGS.INSTANCES_BRANDING],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Branding retrieved successfully", InstanceBrandingModel.Get.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		let instanceHost: string | null;
		try {
			instanceHost = ZitadelAPIUtils.getInstanceHost(await ZitadelClient.getInstance(instanceId));
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		let policy: InstanceBrandingModel.LabelPolicy | null = null;
		let error: string | null = instanceHost ? null : "The instance has no domain yet";
		if (instanceHost) {
			try {
				const parsed = InstanceBrandingModel.LabelPolicy.safeParse(
					await ZitadelClient.getLabelPolicy(instanceHost),
				);
				policy = parsed.success ? parsed.data : null;
				if (!parsed.success) error = "Zitadel returned an unexpected label policy";
			} catch (err) {
				error =
					err instanceof ZitadelApiError && err.status === 403
						? "Forbidden — the system user needs IAM_OWNER through a System membership"
						: err instanceof Error
							? err.message
							: String(err);
			}
		}

		const lastTask = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(
				and(
					eq(DB.Tables.scheduled_tasks.function, "applyDefaultBranding"),
					sql`json_extract(${DB.Tables.scheduled_tasks.args}, '$.instanceId') = ${instanceId}`,
				),
			)
			.orderBy(desc(DB.Tables.scheduled_tasks.id))
			.get();

		return APIResponse.success(c, "Branding retrieved successfully", {
			instanceHost,
			policy,
			error,
			defaults: ZitadelBranding.DEFAULT_LABEL_POLICY,
			defaultFont: {
				fileName: ZitadelBranding.FONT.fileName,
				available: (await ZitadelBranding.loadFont()) !== null,
			},
			lastTask: lastTask ? TaskData.Task.parse(lastTask) : null,
		} satisfies InstanceBrandingModel.Get.Response);
	},
);

router.post(
	"/_apply_defaults",

	APIRouteSpec.authenticated({
		summary: "Apply the default branding",
		description:
			"Queue a background task that applies the LAVIAC default branding (colors, dark theme, no watermark, font) to the instance.",
		tags: [DOCS_TAGS.INSTANCES_BRANDING],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.accepted(
				"Default branding queued successfully",
				InstanceBrandingModel.ApplyDefaults.Response,
			),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		try {
			await ZitadelClient.getInstance(instanceId);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		const taskId = await TaskScheduler.enqueueTask(
			"applyDefaultBranding",
			{ instanceId, actorSub: authContext.user_sub },
			{ created_by_user_sub: authContext.user_sub },
			{ storeLogs: true },
		);

		return APIResponse.accepted(c, "Default branding queued successfully", {
			taskId,
		} satisfies InstanceBrandingModel.ApplyDefaults.Response);
	},
);
