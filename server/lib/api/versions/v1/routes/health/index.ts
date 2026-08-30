import { Hono } from "hono";
import { APIResponse } from "../../../../utils/api-response";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/spec-helpers";
import { DOCS_TAGS } from "../../docs";
import { HealthModel } from "./model";

const app = new Hono();

app.get(
	"/",
	APIRouteSpec.unauthenticated({
		summary: "Health check",
		description: "Returns the service health status.",
		tags: [DOCS_TAGS.SYSTEM],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Service is healthy", HealthModel.Response),
		),
	}),
	(c) => {
		return APIResponse.success(c, "Service is healthy", {
			status: "ok",
			uptime: performance.now(),
		});
	},
);

export const healthRouter = app;
