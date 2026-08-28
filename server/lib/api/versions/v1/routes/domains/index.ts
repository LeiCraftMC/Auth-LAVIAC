/**
 * Domains router — cross-instance domain operations.
 *   POST /domains/:domain/_exists → check whether a domain is already used by any instance
 */
import { Hono } from "hono";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-response";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/spec-helpers";
import { requireAdmin } from "../../middleware/auth";
import { DOCS_TAGS } from "../../tags";
import { handleZitadelError } from "../instances/errors";
import { DomainsModel } from "./model";

const app = new Hono();

app.use("/domains/*", requireAdmin);

app.post(
	"/domains/:domain/_exists",
	APIRouteSpec.authenticated({
		summary: "Check domain availability",
		description: "Returns whether a domain is already in use by any virtual instance.",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Domain availability", DomainsModel.ExistsResponse),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),
	async (c) => {
		const domain = c.req.param("domain");
		try {
			const exists = await ZitadelClient.existsDomain(domain);
			return APIResponse.success(c, "Domain availability", { exists });
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

export const domainsRouter = app;
