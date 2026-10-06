import type { Context } from "hono";
import { Logger } from "../../utils/logger";
import { ZitadelApiError } from "../../zitadel/client";
import type { ZitadelDomain, ZitadelInstance } from "../../zitadel/types";
import { APIResponse } from "./api-res";
import type { InstanceData } from "./shared-models/instanceData";

/** Glue between the Zitadel client and the API: shape mappers + upstream error mapping. */
export class ZitadelAPIUtils {
	static mapDomain(d: ZitadelDomain): InstanceData.Domain {
		return {
			domain: d.domain,
			primary: d.primary,
			generated: d.generated,
		};
	}

	static mapInstance(i: ZitadelInstance): InstanceData.Instance {
		return {
			id: i.id,
			name: i.name,
			state: i.state,
			version: i.version,
			createdAt: i.details?.creationDate,
			changedAt: i.details?.changeDate,
			domains: i.domains?.map(ZitadelAPIUtils.mapDomain),
		};
	}

	/** Map a Zitadel upstream error to the envelope. */
	static handleError(c: Context, err: unknown): Response {
		Logger.error("Zitadel API error:", err);

		if (err instanceof ZitadelApiError) {
			if (err.status === 404) return APIResponse.notFound(c, err.message);
			if (err.status === 409) return APIResponse.conflict(c, err.message);
			if (err.status === 400) return APIResponse.badRequest(c, err.message);
			if (err.status === 403) return APIResponse.forbidden(c, err.message);
			return APIResponse.serverError(c, err.message);
		}
		return APIResponse.serverError(c, "Upstream Zitadel request failed");
	}
}
