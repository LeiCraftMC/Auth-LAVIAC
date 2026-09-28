/**
 * Domains sub-router — mounted at /instances/:instanceId/domains by the instances router.
 *   GET    /                      → list domains
 *   POST   /                      → add a custom domain
 *   DELETE /:domain               → remove a custom domain
 *   POST   /_set_primary          → set the primary domain
 */
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { handleZitadelError } from "../errors";
import { mapDomain } from "../mapper";
import { InstanceDomainsModel } from "./model";

const app = new Hono();

app.get(
	"/",
	APIRouteSpec.authenticated({
		summary: "List instance domains",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Domains", InstanceDomainsModel.List.Response),
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
	zValidator("json", InstanceDomainsModel.Add.Body),
	APIRouteSpec.authenticated({
		summary: "Add a custom domain",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.createdNoData("Domain added"),
			APIResponseSpec.conflict("Domain already exists"),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
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
	zValidator("json", InstanceDomainsModel.SetPrimary.Body),
	APIRouteSpec.authenticated({
		summary: "Set the primary domain",
		tags: [DOCS_TAGS.DOMAINS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Primary domain updated"),
			APIResponseSpec.notFound("Domain not found"),
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
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
			APIResponseSpec.unauthorized(),
			APIResponseSpec.forbidden(),
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
