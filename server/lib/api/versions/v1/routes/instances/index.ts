/**
 * Instances router — virtual instance CRUD over the Zitadel v1 System API.
 *   GET    /instances           → list instances
 *   POST   /instances           → create an instance
 *   GET    /instances/:id       → get an instance
 *   PUT    /instances/:id       → rename an instance
 *   DELETE /instances/:id       → delete an instance
 *   /instances/:instanceId/domains/*  → domains sub-router
 *   /instances/:instanceId/limits/*   → limits sub-router
 *
 * All routes require an admin session (requireAdmin middleware).
 */
import { Hono } from "hono";
import { validator } from "hono-openapi";
import { Audit } from "../../../../../../utils/audit";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-response";
import { AuthHandler } from "../../../../utils/auth-handler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/spec-helpers";
import { requireAdmin } from "../../middleware/auth";
import { DOCS_TAGS } from "../../tags";
import { instanceDomainsRouter } from "./domains";
import { handleZitadelError } from "./errors";
import { instanceLimitsRouter } from "./limits";
import { mapInstance } from "./mapper";
import { InstancesModel } from "./model";

const app = new Hono();

// Every /instances/** route requires an admin session. Scoped to /instances/* so it
// does not leak to sibling routers (health, auth) that mount at the same root.
app.use("/instances/*", requireAdmin);

app.get(
	"/instances",
	APIRouteSpec.authenticated({
		summary: "List virtual instances",
		description: "Lists all virtual instances on the Zitadel deployment (System API).",
		tags: [DOCS_TAGS.INSTANCES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instances", InstancesModel.ListResponse),
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

app.post(
	"/instances",
	validator("json", InstancesModel.CreateBody),
	APIRouteSpec.authenticated({
		summary: "Create a virtual instance",
		description:
			"Creates a new Zitadel instance with its first org and an owner (human or machine). This is the only operation that requires the System API create endpoint.",
		tags: [DOCS_TAGS.INSTANCES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Instance created", InstancesModel.CreateResponse),
			APIResponseSpec.conflict("Instance or domain already exists"),
		),
	}),
	async (c) => {
		const body = c.req.valid("json");
		try {
			const result = await ZitadelClient.createInstance(body);
			const ctx = AuthHandler.getAuthContext(c);
			await Audit.log(
				ctx.type === "session" ? ctx.sub : "system",
				"instance.create",
				result.instanceId,
				body.instanceName,
			);
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

app.get(
	"/instances/:id",
	APIRouteSpec.authenticated({
		summary: "Get a virtual instance",
		tags: [DOCS_TAGS.INSTANCES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instance", InstancesModel.Response),
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

app.put(
	"/instances/:id",
	validator("json", InstancesModel.UpdateBody),
	APIRouteSpec.authenticated({
		summary: "Rename a virtual instance",
		description: "Updates the instance name. Only the name is mutable via the System API.",
		tags: [DOCS_TAGS.INSTANCES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Instance updated", InstancesModel.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),
	async (c) => {
		const id = c.req.param("id");
		const { instanceName } = c.req.valid("json");
		try {
			await ZitadelClient.updateInstance(id, instanceName);
			const instance = await ZitadelClient.getInstance(id);
			const ctx = AuthHandler.getAuthContext(c);
			await Audit.log(
				ctx.type === "session" ? ctx.sub : "system",
				"instance.update",
				id,
				instanceName,
			);
			return APIResponse.success(c, "Instance updated", mapInstance(instance));
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

app.delete(
	"/instances/:id",
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
			const ctx = AuthHandler.getAuthContext(c);
			await Audit.log(ctx.type === "session" ? ctx.sub : "system", "instance.delete", id);
			return APIResponse.successNoData(c, "Instance deleted");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

// Sub-routers — inherit the requireAdmin middleware from this app.
app.route("/instances/:instanceId/domains", instanceDomainsRouter);
app.route("/instances/:instanceId/limits", instanceLimitsRouter);

export const instancesRouter = app;
