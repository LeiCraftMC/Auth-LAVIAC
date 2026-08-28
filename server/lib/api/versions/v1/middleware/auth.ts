/**
 * requireAdmin — Hono middleware that rejects requests without an admin session.
 * The authContext is resolved globally in API.init() (see server/lib/api/index.ts).
 */
import type { MiddlewareHandler } from "hono";
import { APIResponse } from "../../../utils/api-response";
import { AuthHandler } from "../../../utils/auth-handler";

export const requireAdmin: MiddlewareHandler = async (c, next) => {
	const ctx = AuthHandler.getAuthContext(c);
	if (ctx.type !== "session" || !ctx.isAdmin) {
		return APIResponse.forbidden(c, "Admin access required");
	}
	await next();
};
