/**
 * Domains sub-router — mounted at /instances/:instanceId/domains by the instances router.
 *   GET    /                      → list domains
 *   POST   /                      → add a custom domain
 *   DELETE /:domain               → remove a custom domain
 *   POST   /_set_primary          → set the primary domain
 */
import { Hono } from "hono";
import { validator } from "hono-openapi";
import { ZitadelClient } from "../../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-response";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/spec-helpers";
import { DOCS_TAGS } from "../../../tags";
import { handleZitadelError } from "../errors";
import { mapDomain } from "../mapper";
import { DomainsModel } from "../model";

const app = new Hono();

app.get(
	"/",
	APIRouteSpec.authenticated({
		summary: "List instance domains",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Domains", DomainsModel.ListResponse),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		try {
			const domains = await ZitadelClient.listDomains(instanceId);
			return APIResponse.success(c, "Domains", domains.map(mapDomain));
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

app.post(
	"/",
	validator("json", DomainsModel.AddBody),
	APIRouteSpec.authenticated({
		summary: "Add a custom domain",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.createdNoData("Domain added"),
			APIResponseSpec.conflict("Domain already exists"),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		const { domain } = c.req.valid("json");
		try {
			await ZitadelClient.addDomain(instanceId, domain);
			return APIResponse.createdNoData(c, "Domain added");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

app.post(
	"/_set_primary",
	validator("json", DomainsModel.SetPrimaryBody),
	APIRouteSpec.authenticated({
		summary: "Set the primary domain",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Primary domain updated"),
			APIResponseSpec.notFound("Domain not found"),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		const { domain } = c.req.valid("json");
		try {
			await ZitadelClient.setPrimaryDomain(instanceId, domain);
			return APIResponse.successNoData(c, "Primary domain updated");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

app.delete(
	"/:domain",
	APIRouteSpec.authenticated({
		summary: "Remove a custom domain",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Domain removed"),
			APIResponseSpec.notFound("Domain not found"),
		),
	}),
	async (c) => {
		const instanceId = c.req.param("instanceId") ?? "";
		const domain = c.req.param("domain");
		try {
			await ZitadelClient.removeDomain(instanceId, domain);
			return APIResponse.successNoData(c, "Domain removed");
		} catch (err) {
			return handleZitadelError(c, err);
		}
	},
);

export const instanceDomainsRouter = app;
