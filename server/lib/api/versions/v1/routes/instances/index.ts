import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../db";
import { TaskScheduler } from "../../../../../tasks";
import { Audit } from "../../../../../utils/audit";
import { ConfigHandler } from "../../../../../utils/config";
import { Logger } from "../../../../../utils/logger";
import { ZitadelClient } from "../../../../../zitadel/client";
import { InstanceTemplates } from "../../../../../zitadel/templates";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../utils/zitadel";
import { DOCS_TAGS } from "../../docs";
import { InstancesModel } from "./model";

export const router = new Hono().basePath("/instances");

router.use("*", async (c, next) => {
	const authContext = AuthHandler.AuthContext.get(c);

	if (authContext.type === "unauthenticated") {
		return APIResponse.unauthorized(c, "Authentication required");
	}

	if (authContext.user_role !== "admin") {
		return APIResponse.forbidden(c, "This endpoint is restricted to administrators");
	}

	await next();
});

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List virtual instances",
		description: "List all virtual instances of the Zitadel deployment (System API).",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instances retrieved successfully", InstancesModel.GetAll.Response),
		),
	}),

	async (c) => {
		let instances: Awaited<ReturnType<typeof ZitadelClient.listInstances>>;
		try {
			instances = await ZitadelClient.listInstances();
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		const templates = new Map(
			DB.instance()
				.select({
					instanceId: DB.Tables.instanceSetups.instance_id,
					template: DB.Tables.instanceSetups.template,
				})
				.from(DB.Tables.instanceSetups)
				.all()
				.map((setup) => [setup.instanceId, setup.template]),
		);

		return APIResponse.success(
			c,
			"Instances retrieved successfully",
			instances.map((instance) => ({
				...ZitadelAPIUtils.mapInstance(instance),
				template: templates.get(instance.id) ?? null,
			})) satisfies InstancesModel.GetAll.Response,
		);
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Create a virtual instance",
		description:
			"Create a new Zitadel instance from a template. The first org is always the SYSTEM org, which holds the ZITADEL project and the owner (human or machine) as the initial admin. A background task then applies the template: the security baseline, the instance defaults and the home org, which becomes the default org. Unless disabled, a second task applies the LAVIAC default branding.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Instance created successfully", InstancesModel.Create.Response),
			APIResponseSpec.conflict("Conflict: Instance or domain already exists"),
		),
	}),

	zValidator("json", InstancesModel.Create.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		const { template, templateOptions, ...body } = c.req.valid("json");

		let result: Awaited<ReturnType<typeof ZitadelClient.createInstance>>;
		try {
			result = await ZitadelClient.createInstance({
				...body,
				firstOrgName: InstanceTemplates.SYSTEM_ORG_NAME,
			});
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		await Audit.log(
			authContext.user_sub,
			"instance.create",
			result.instanceId,
			`${body.instanceName} (template ${template})`,
		);

		// The instance exists from here on: failures below are logged, not returned — the
		// template can be re-applied from the instance's Template page.
		let provisioningTaskId: number | null = null;
		try {
			DB.instance()
				.insert(DB.Tables.instanceSetups)
				.values({
					instance_id: result.instanceId,
					template,
					options: templateOptions,
					created_by_user_sub: authContext.user_sub,
				})
				.run();

			provisioningTaskId = await TaskScheduler.enqueueTask(
				"provisionInstance",
				{ instanceId: result.instanceId, actorSub: authContext.user_sub },
				{ created_by_user_sub: authContext.user_sub },
				{ storeLogs: true },
			);
		} catch (err) {
			Logger.error("Failed to queue the provisioning task:", err);
		}

		let brandingTaskId: number | null = null;
		if (ConfigHandler.getConfig()?.ZITADEL_APPLY_DEFAULT_BRANDING === true) {
			try {
				brandingTaskId = await TaskScheduler.enqueueTask(
					"applyDefaultBranding",
					{ instanceId: result.instanceId, actorSub: authContext.user_sub },
					{ created_by_user_sub: authContext.user_sub },
					{ storeLogs: true },
				);
			} catch (err) {
				// The instance exists — report it; the branding can be re-applied from its page.
				Logger.error("Failed to queue the default branding task:", err);
			}
		}

		return APIResponse.created(c, "Instance created successfully", {
			instanceId: result.instanceId,
			pat: result.pat,
			machineKey: result.machineKey,
			provisioningTaskId,
			brandingTaskId,
		} satisfies InstancesModel.Create.Response);
	},
);

router.get(
	"/:instanceId",

	APIRouteSpec.authenticated({
		summary: "Get a virtual instance",
		description: "Retrieve one virtual instance including its domains.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Instance retrieved successfully", InstancesModel.Get.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		try {
			const instance = await ZitadelClient.getInstance(instanceId);
			return APIResponse.success(
				c,
				"Instance retrieved successfully",
				ZitadelAPIUtils.mapInstance(instance),
			);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.put(
	"/:instanceId",

	APIRouteSpec.authenticated({
		summary: "Rename a virtual instance",
		description: "Update the instance name. Only the name is mutable via the System API.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Instance updated successfully", InstancesModel.Update.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),
	zValidator("json", InstancesModel.Update.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;
		const { instanceName } = c.req.valid("json");

		try {
			await ZitadelClient.updateInstance(instanceId, instanceName);
			const instance = await ZitadelClient.getInstance(instanceId);
			await Audit.log(authContext.user_sub, "instance.update", instanceId, instanceName);
			return APIResponse.success(
				c,
				"Instance updated successfully",
				ZitadelAPIUtils.mapInstance(instance),
			);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.delete(
	"/:instanceId",

	APIRouteSpec.authenticated({
		summary: "Delete a virtual instance",
		description: "Permanently remove the instance. This may take some time on the Zitadel side.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Instance deleted successfully"),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		try {
			await ZitadelClient.deleteInstance(instanceId);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		await DB.instance()
			.delete(DB.Tables.instanceSetups)
			.where(eq(DB.Tables.instanceSetups.instance_id, instanceId));
		await Audit.log(authContext.user_sub, "instance.delete", instanceId);
		return APIResponse.successNoData(c, "Instance deleted successfully");
	},
);

// Sub-routers: their basePath ("/domains", "/limits", "/branding", "/template") completes the
// mount below the :instanceId param; they inherit the admin guard above.
router.route("/:instanceId", (await import("./domains")).router);
router.route("/:instanceId", (await import("./limits")).router);
router.route("/:instanceId", (await import("./branding")).router);
router.route("/:instanceId", (await import("./template")).router);
