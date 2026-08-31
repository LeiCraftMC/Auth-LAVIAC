import { createMiddleware } from "hono/factory";
import { APIResponse } from "../../../utils/api-res";
import { AuthHandler } from "../../../utils/authHandler";

/**
 * Global v1 middleware — resolve the bearer/cookie session into an AuthContext and stash
 * it on the request so handlers can read it via `AuthHandler.getAuthContext(c)`. It does
 * NOT gate: unauthenticated requests pass through, and per-route authorization is enforced
 * by `requireAdmin` and `APIRouteSpec.authenticated`.
 */
export const authMiddlewareV1 = createMiddleware(async (c, next) => {
	const ctx = await AuthHandler.resolveRequest(c);
	AuthHandler.setAuthContext(c, ctx);
	await next();
});

/** Per-route middleware: require an authenticated admin session. */
export const requireAdmin = createMiddleware(async (c, next) => {
	const ctx = AuthHandler.getAuthContext(c);
	if (ctx.type !== "session" || !ctx.isAdmin) {
		return APIResponse.forbidden(c, "Admin access required");
	}
	await next();
});