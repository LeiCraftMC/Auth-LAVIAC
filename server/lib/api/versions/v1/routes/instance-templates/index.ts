import { Hono } from "hono";
import { InstanceTemplates } from "../../../../../zitadel/templates";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { InstanceTemplatesModel } from "./model";

export const router = new Hono().basePath("/instance-templates");

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
		summary: "List the instance templates",
		description:
			"The templates a virtual instance can be created with, each with the settings it applies. Templates are defined in code and read-only.",
		tags: [DOCS_TAGS.INSTANCE_TEMPLATES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success(
				"Instance templates retrieved successfully",
				InstanceTemplatesModel.GetAll.Response,
			),
		),
	}),

	async (c) => {
		return APIResponse.success(c, "Instance templates retrieved successfully", {
			systemOrgName: InstanceTemplates.SYSTEM_ORG_NAME,
			templates: InstanceTemplates.list().map((template) => ({
				...template,
				sections: InstanceTemplates.describe(template.id, null),
			})),
		} satisfies InstanceTemplatesModel.GetAll.Response);
	},
);
