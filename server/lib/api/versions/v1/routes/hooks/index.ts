/**
 * Webhooks Zitadel calls as Actions v2 targets. They are authenticated by the target's
 * `ZITADEL-Signature`, not a session, and answer in Zitadel's format instead of the
 * `{ success, code, message, data }` envelope (errors keep the envelope; Zitadel only reads their
 * status). Hidden from the API docs, so they stay out of the generated client.
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../db";
import { Logger } from "../../../../../utils/logger";
import { ZitadelUsernameClaim } from "../../../../../zitadel/usernameClaim";
import { APIResponse } from "../../../../utils/api-res";
import { APIRouteSpec } from "../../../../utils/specHelpers";
import { HooksModel } from "./model";

export const router = new Hono().basePath("/hooks");

router.post(
	"/username-claim/:instanceId",

	APIRouteSpec.unauthenticated({
		summary: "Username claim (Zitadel preuserinfo target)",
		hide: true,
		responses: {},
	}),

	zValidator("param", HooksModel.UsernameClaim.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { instanceId } = c.req.valid("param") as HooksModel.UsernameClaim.Params;

		// Only instances LAVIAC provisioned have the target; anything else never reaches Zitadel.
		const setup = DB.instance()
			.select({ instanceId: DB.Tables.instanceSetups.instance_id })
			.from(DB.Tables.instanceSetups)
			.where(eq(DB.Tables.instanceSetups.instance_id, instanceId))
			.get();
		if (!ZitadelUsernameClaim.enabled() || !setup) {
			return APIResponse.notFound(c, "No username claim for this instance");
		}

		const body = await c.req.text();
		try {
			const signed = await ZitadelUsernameClaim.verify(
				instanceId,
				c.req.header("ZITADEL-Signature"),
				body,
			);
			if (!signed) return APIResponse.unauthorized(c, "Invalid ZITADEL-Signature");
		} catch (err) {
			Logger.error(`Username claim: reading the signing key of instance ${instanceId} failed:`, err);
			return APIResponse.serverError(c, "The signing key could not be read");
		}

		let payload: ZitadelUsernameClaim.Payload;
		try {
			payload = JSON.parse(body);
		} catch {
			return APIResponse.badRequest(c, "The body is not JSON");
		}
		return c.json(ZitadelUsernameClaim.answer(payload), 200);
	},
);
