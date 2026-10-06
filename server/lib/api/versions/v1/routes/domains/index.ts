import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { ZitadelClient } from "../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { ZitadelAPIUtils } from "../../../../utils/zitadel";
import { DOCS_TAGS } from "../../docs";
import { DomainsModel } from "./model";

export const router = new Hono().basePath("/domains");

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

// The exists check is a safe read, so it is a GET (the Zitadel upstream call it maps to
// remains a POST — see ZitadelClient.existsDomain).
router.get(
	"/:domain/_exists",

	APIRouteSpec.authenticated({
		summary: "Check domain availability",
		description: "Whether a domain is already in use by any virtual instance.",
		tags: [DOCS_TAGS.DOMAINS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success(
				"Domain availability retrieved successfully",
				DomainsModel.Exists.Response,
			),
		),
	}),

	zValidator("param", DomainsModel.Exists.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { domain } = c.req.valid("param") as DomainsModel.Exists.Params;

		try {
			const exists = await ZitadelClient.existsDomain(domain);
			return APIResponse.success(c, "Domain availability retrieved successfully", {
				exists,
			} satisfies DomainsModel.Exists.Response);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);
