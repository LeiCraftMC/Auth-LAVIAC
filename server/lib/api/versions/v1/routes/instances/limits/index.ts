import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { Audit } from "../../../../../../utils/audit";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler } from "../../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../../utils/zitadel";
import { DOCS_TAGS } from "../../../docs";
import { InstancesModel } from "../model";
import { InstanceLimitsModel } from "./model";

export const router = new Hono().basePath("/limits");

router.put(
	"/",

	APIRouteSpec.authenticated({
		summary: "Set instance limits",
		description:
			"Set the audit-log retention and/or the block flag of an instance. `block: true` blocks the instance.",
		tags: [DOCS_TAGS.INSTANCES_LIMITS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Limits updated successfully"),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),
	zValidator("json", InstanceLimitsModel.Set.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;
		const body = c.req.valid("json");

		try {
			await ZitadelClient.setLimits(instanceId, body);
			await Audit.log(authContext.user_sub, "instance.limits.set", instanceId, JSON.stringify(body));
			return APIResponse.successNoData(c, "Limits updated successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.delete(
	"/",

	APIRouteSpec.authenticated({
		summary: "Reset instance limits",
		description: "Reset the instance's limits to the deployment defaults.",
		tags: [DOCS_TAGS.INSTANCES_LIMITS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Limits reset successfully"),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		try {
			await ZitadelClient.resetLimits(instanceId);
			await Audit.log(authContext.user_sub, "instance.limits.reset", instanceId);
			return APIResponse.successNoData(c, "Limits reset successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);
