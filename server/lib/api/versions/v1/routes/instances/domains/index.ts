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
import { InstanceDomainsModel } from "./model";

export const router = new Hono().basePath("/domains");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List instance domains",
		description: "List the generated and custom domains of a virtual instance.",
		tags: [DOCS_TAGS.INSTANCES_DOMAINS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Domains retrieved successfully", InstanceDomainsModel.GetAll.Response),
			APIResponseSpec.notFound("Instance not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;

		try {
			const domains = await ZitadelClient.listDomains(instanceId);
			return APIResponse.success(
				c,
				"Domains retrieved successfully",
				domains.map(ZitadelAPIUtils.mapDomain),
			);
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Add a custom domain",
		description: "Attach a custom domain to a virtual instance.",
		tags: [DOCS_TAGS.INSTANCES_DOMAINS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.createdNoData("Domain added successfully"),
			APIResponseSpec.conflict("Conflict: Domain already exists"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),
	zValidator("json", InstanceDomainsModel.Add.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;
		const { domain } = c.req.valid("json");

		try {
			await ZitadelClient.addDomain(instanceId, domain);
			await Audit.log(authContext.user_sub, "instance.domain.add", instanceId, domain);
			return APIResponse.createdNoData(c, "Domain added successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.post(
	"/_set_primary",

	APIRouteSpec.authenticated({
		summary: "Set the primary domain",
		description: "Make one of the instance's domains its primary domain.",
		tags: [DOCS_TAGS.INSTANCES_DOMAINS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Primary domain updated successfully"),
			APIResponseSpec.notFound("Domain not found"),
		),
	}),

	zValidator("param", InstancesModel.InstanceId.Params),
	zValidator("json", InstanceDomainsModel.SetPrimary.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as InstancesModel.InstanceId.Params;
		const { domain } = c.req.valid("json");

		try {
			await ZitadelClient.setPrimaryDomain(instanceId, domain);
			await Audit.log(authContext.user_sub, "instance.domain.set_primary", instanceId, domain);
			return APIResponse.successNoData(c, "Primary domain updated successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);

router.delete(
	"/:domain",

	APIRouteSpec.authenticated({
		summary: "Remove a custom domain",
		description: "Detach a custom domain from a virtual instance. Generated domains stay.",
		tags: [DOCS_TAGS.INSTANCES_DOMAINS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Domain removed successfully"),
			APIResponseSpec.notFound("Domain not found"),
		),
	}),

	zValidator("param", InstanceDomainsModel.Domain.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId, domain } = c.req.valid("param") as InstanceDomainsModel.Domain.Params;

		try {
			await ZitadelClient.removeDomain(instanceId, domain);
			await Audit.log(authContext.user_sub, "instance.domain.remove", instanceId, domain);
			return APIResponse.successNoData(c, "Domain removed successfully");
		} catch (err) {
			return ZitadelAPIUtils.handleError(c, err);
		}
	},
);
