import { Hono } from "hono";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { HealthModel } from "./model";

export const router = new Hono().basePath("/health");

router.get(
	"/",

	APIRouteSpec.unauthenticated({
		summary: "Health check",
		description: "Returns the service health status.",
		tags: [DOCS_TAGS.SYSTEM],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Service is healthy", HealthModel.Check.Response),
		),
	}),

	(c) => {
		return APIResponse.success(c, "Service is healthy", {
			status: "ok",
			uptime: performance.now(),
		} satisfies HealthModel.Check.Response);
	},
);
