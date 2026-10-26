/**
 * Webhooks Zitadel calls as Actions v2 targets. They are authenticated by the target's
 * `ZITADEL-Signature`, not a session, and answer in Zitadel's format instead of the
 * `{ success, code, message, data }` envelope (errors keep the envelope; Zitadel only reads their
 * status). Hidden from the API docs, so they stay out of the generated client.
 */
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { Logger } from "../../../../../utils/logger";
import { ZitadelClaims } from "../../../../../zitadel/claims";
import { APIResponse } from "../../../../utils/api-res";
import { APIRouteSpec } from "../../../../utils/specHelpers";
import { HooksModel } from "./model";

export const router = new Hono().basePath("/hooks");

router.post(
	"/claims/:instanceId",

	APIRouteSpec.unauthenticated({
		summary: "Claims (Zitadel preuserinfo target)",
		hide: true,
		responses: {},
	}),

	zValidator("param", HooksModel.Claims.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as HooksModel.Claims.Params;

		if (!ZitadelClaims.enabled()) {
			return APIResponse.notFound(c, "The claims webhook is off");
		}

		const body = await c.req.text();
		try {
			if (!(await ZitadelClaims.isKnownInstance(instanceId))) {
				return APIResponse.notFound(c, "No such instance");
			}
			const signed = await ZitadelClaims.verify(instanceId, c.req.header("ZITADEL-Signature"), body);
			if (!signed) return APIResponse.unauthorized(c, "Invalid ZITADEL-Signature");
		} catch (err) {
			Logger.error(`Claims: checking a call for instance ${instanceId} failed:`, err);
			return APIResponse.serverError(c, "The signing key could not be read");
		}

		let payload: ZitadelClaims.Payload;
		try {
			payload = JSON.parse(body);
		} catch {
			return APIResponse.badRequest(c, "The body is not JSON");
		}
		return c.json(ZitadelClaims.answer(payload), 200);
	},
);
