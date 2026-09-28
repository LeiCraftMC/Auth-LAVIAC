/**
 * Instances router — virtual instance CRUD over the Zitadel v1 System API.
 *   GET    /                     → list instances
 *   POST   /                     → create an instance
 *   GET    /:id                  → get an instance
 *   PUT    /:id                  → rename an instance
 *   DELETE /:id                  → delete an instance
 *   /:instanceId/domains/*       → domains sub-router
 *   /:instanceId/limits/*       → limits sub-router
 *
 * All routes require an admin session (requireAdmin middleware).
 */
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { Audit } from "../../../../../utils/audit";
import { ZitadelClient } from "../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { requireAdmin } from "../../middleware/auth";
import { handleZitadelError } from "./errors";
import { mapInstance } from "./mapper";
import { InstancesModel } from "./model";

export const router = new Hono().basePath("/instances");

// All routes below require authentication via an admin session.
router.use("*", requireAdmin);

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List virtual instances",
		description: "Lists all virtual instances on the Zitadel deployment (System API).",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instances", InstancesModel.List.Response),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),

	async (c) => {
		try {
			const instances = await ZitadelClient.listInstances();
			return APIResponse.success(c, "Instances", instances.map(mapInstance));
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Create a virtual instance",
		description:
			"Creates a new Zitadel instance with its first org and an owner (human or machine). This is the only operation that requires the System API create endpoint.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Instance created", InstancesModel.Create.Response),
			APIResponseSpec.conflict("Instance or domain already exists"),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),

	zValidator("json", InstancesModel.Create.Body),

	async (c) => {
		const body = c.req.valid("json");
		try {
			const result = await ZitadelClient.createInstance(body);
			const authContext = AuthHandler.AuthContext.getAsSession(c);
			await Audit.log(authContext.user_sub, "instance.create", result.instanceId, body.instanceName);
			return APIResponse.created(c, "Instance created", {
				instanceId: result.instanceId,
				pat: result.pat,
				machineKey: result.machineKey,
			});
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

router.get(
	"/:id",

	APIRouteSpec.authenticated({
		summary: "Get a virtual instance",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instance", InstancesModel.Get.Response),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	async (c) => {
		const id = c.req.param("id");
		try {
			const instance = await ZitadelClient.getInstance(id);
			return APIResponse.success(c, "Instance", mapInstance(instance));
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

router.put(
	"/:id",

	APIRouteSpec.authenticated({
		summary: "Rename a virtual instance",
		description: "Updates the instance name. Only the name is mutable via the System API.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Instance updated", InstancesModel.Get.Response),
			APIResponseSpec.notFound("Instance not found"),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),

	zValidator("json", InstancesModel.Update.Body),

	async (c) => {
		const id = c.req.param("id");
		const { instanceName } = c.req.valid("json");
		try {
			await ZitadelClient.updateInstance(id, instanceName);
			const instance = await ZitadelClient.getInstance(id);
			const authContext = AuthHandler.AuthContext.getAsSession(c);
			await Audit.log(authContext.user_sub, "instance.update", id, instanceName);
			return APIResponse.success(c, "Instance updated", mapInstance(instance));
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

router.delete(
	"/:id",

	APIRouteSpec.authenticated({
		summary: "Delete a virtual instance",
		description: "Permanently removes the instance. This may take some time on the Zitadel side.",
		tags: [DOCS_TAGS.INSTANCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Instance deleted"),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	async (c) => {
		const id = c.req.param("id");
		try {
			await ZitadelClient.deleteInstance(id);
			const authContext = AuthHandler.AuthContext.getAsSession(c);
			await Audit.log(authContext.user_sub, "instance.delete", id);
			return APIResponse.successNoData(c, "Instance deleted");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

// Sub-routers — inherit the requireAdmin middleware from this router. Their basePath
// ("/domains", "/limits") completes the mount below the :instanceId param.
router.route("/:instanceId", (await import("./domains")).router);
router.route("/:instanceId", (await import("./limits")).router);
