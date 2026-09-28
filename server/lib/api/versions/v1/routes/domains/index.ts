/**
 * Domains router — cross-instance domain operations.
 *   GET /:domain/_exists → check whether a domain is already used by any instance
 *
 * The exists check is a safe read, so it is a GET (the Zitadel upstream call it maps to
 * remains a POST — see ZitadelClient.existsDomain).
 */
import { Hono } from "hono";
import { ZitadelClient } from "../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { requireAdmin } from "../../middleware/auth";
import { handleZitadelError } from "../instances/errors";
import { DomainsModel } from "./model";

export const router = new Hono().basePath("/domains");

// All routes below require authentication via an admin session.
router.use("*", requireAdmin);

router.get(
	"/:domain/_exists",

	APIRouteSpec.authenticated({
		summary: "Check domain availability",
		description: "Returns whether a domain is already in use by any virtual instance.",
		tags: [DOCS_TAGS.DOMAINS],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Domain availability", DomainsModel.Exists.Response),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),

	async (c) => {
		const domain = c.req.param("domain");
		try {
			const exists = await ZitadelClient.existsDomain(domain);
			return APIResponse.success(c, "Domain availability", {
				exists,
			} satisfies DomainsModel.Exists.Response);
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);
