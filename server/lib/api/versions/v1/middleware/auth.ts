import { createMiddleware } from "hono/factory";
import { APIResponse } from "../../../utils/api-res";
import { AuthHandler } from "../../../utils/authHandler";

/**
 * Unauthenticated requests may only reach these paths (docs/10-auth.md): the login
 * routes (OIDC redirect + static credential login), the OIDC callback, the
 * login-methods discovery endpoint, and the version health check. Everything else
 * requires a valid session (bearer header or session cookie).
 */
const PUBLIC_AUTH_PATHS = new Set([
	"/v1",
	"/v1/",
	"/v1/auth/login",
	"/v1/auth/callback",
	"/v1/auth/methods",
]);

/**
 * Global v1 middleware — resolve the bearer/cookie session into an AuthContext, stash it
 * on the request for handlers, and gate: unauthenticated requests outside the public
 * auth paths are rejected with 401. Role checks stay per-route via `requireAdmin`.
 */
export const authMiddlewareV1 = createMiddleware(async (c, next) => {
	const ctx = await AuthHandler.resolveRequest(c);
	AuthHandler.setAuthContext(c, ctx);

	if (ctx.type === "unauthenticated") {
		// The app is mounted at /api in Nitro but addressed directly in tests — normalize.
		const path = c.req.path.replace(/^\/api(?=\/)/, "");
		if (!PUBLIC_AUTH_PATHS.has(path)) {
			return APIResponse.unauthorized(c, "Missing or invalid Authorization header");
		}
	}

	await next();
});

/** Per-route middleware: require an authenticated admin session. */
export const requireAdmin = createMiddleware(async (c, next) => {
	const ctx = AuthHandler.getAuthContext(c);
	if (ctx.type !== "session" || ctx.user_role !== "admin") {
		return APIResponse.forbidden(c, "Admin access required");
	}
	await next();
});
