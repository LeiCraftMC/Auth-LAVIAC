import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { TaskScheduler } from "../../../../../tasks";
import { Audit } from "../../../../../utils/audit";
import { ConfigHandler } from "../../../../../utils/config";
import { Logger } from "../../../../../utils/logger";
import { ZitadelClient } from "../../../../../zitadel/client";
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
		try {
			const instances = await ZitadelClient.listInstances();
			return APIResponse.success(
				c,
				"Instances retrieved successfully",
				instances.map(ZitadelAPIUtils.mapInstance),
			);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Create a virtual instance",
		description:
			"Create a new Zitadel instance with its first org and an owner (human or machine). Unless disabled, the LAVIAC default branding is applied afterwards by a background task.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Instance created successfully", InstancesModel.Create.Response),
			APIResponseSpec.conflict("Conflict: Instance or domain already exists"),
		),
	}),

	zValidator("json", InstancesModel.Create.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		const body = c.req.valid("json");

		let result: Awaited<ReturnType<typeof ZitadelClient.createInstance>>;
		try {
			result = await ZitadelClient.createInstance(body);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}

		await Audit.log(authContext.user_sub, "instance.create", result.instanceId, body.instanceName);

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
			await Audit.log(authContext.user_sub, "instance.delete", instanceId);
			return APIResponse.successNoData(c, "Instance deleted successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

// Sub-routers: their basePath ("/domains", "/limits", "/branding") completes the mount below
// the :instanceId param; they inherit the admin guard above.
router.route("/:instanceId", (await import("./domains")).router);
router.route("/:instanceId", (await import("./limits")).router);
router.route("/:instanceId", (await import("./branding")).router);
