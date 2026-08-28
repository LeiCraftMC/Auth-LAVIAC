/**
 * Limits sub-router — mounted at /instances/:instanceId/limits by the instances router.
 *   PUT    /   → set limits (audit log retention, block flag)
 *   DELETE /   → reset limits to defaults
 */
import { Hono } from "hono";
import { validator } from "hono-openapi";
import { ZitadelClient } from "../../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-response";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/spec-helpers";
import { DOCS_TAGS } from "../../../tags";
import { handleZitadelError } from "../errors";
import { LimitsModel } from "../model";

const app = new Hono();

app.put(
	"/",
	validator("json", LimitsModel.SetBody),
	APIRouteSpec.authenticated({
		summary: "Set instance limits",
		description:
			"Set the audit-log retention and/or the block flag for an instance. `block: true` blocks the instance.",
		tags: [DOCS_TAGS.LIMITS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Limits updated"),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		const body = c.req.valid("json");
		try {
			await ZitadelClient.setLimits(instanceId, body);
			return APIResponse.successNoData(c, "Limits updated");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

app.delete(
	"/",
	APIRouteSpec.authenticated({
		summary: "Reset instance limits",
		tags: [DOCS_TAGS.LIMITS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Limits reset"),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		try {
			await ZitadelClient.resetLimits(instanceId);
			return APIResponse.successNoData(c, "Limits reset");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

export const instanceLimitsRouter = app;
