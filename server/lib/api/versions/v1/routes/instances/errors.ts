import type { Context } from "hono";
import { ZitadelApiError } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../utils/api-res";

/** Map a Zitadel upstream error to the LAVIAC envelope. */
export function handleZitadelError(c: Context, err: unknown): Response {
	if (err instanceof ZitadelApiError) {
		if (err.status === 404) return APIResponse.notFound(c, err.message);
		if (err.status === 409) return APIResponse.conflict(c, err.message);
		if (err.status === 400) return APIResponse.badRequest(c, err.message);
		if (err.status === 403) return APIResponse.forbidden(c, err.message);
		return APIResponse.serverError(c, err.message);
	}
	return APIResponse.serverError(c, "Upstream Zitadel request failed");
}
