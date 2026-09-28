import { createMiddleware } from "hono/factory";
import { APIResponse } from "../../../utils/api-res";
import { AuthHandler } from "../../../utils/authHandler";

export const authMiddlewareV1 = createMiddleware(async (c, next) => {
	const authHeader = c.req.header("Authorization");

	if (!authHeader) {
		AuthHandler.AuthContext.set(c, {
			type: "unauthenticated",
		} satisfies AuthHandler.UnauthenticatedAuthContext);

		return await next();
	}

	// The app is mounted at /api in Nitro but addressed directly in tests — normalize so
	// the public-path checks below see the same paths in both modes.
	const path = c.req.path.replace(/^\/api(?=\/)/, "");

	if (!authHeader.startsWith("Bearer ")) {
		// Allow unauthenticated access to the login routes (OIDC redirect + static fallback),
		// the OIDC callback, and the login-methods discovery endpoint, which may be accessed
		// with an invalid or missing token.
		if (isPublicAuthPath(path)) {
			AuthHandler.AuthContext.set(c, {
				type: "unauthenticated",
			} satisfies AuthHandler.UnauthenticatedAuthContext);

			return await next();
		}

		return APIResponse.unauthorized(c, "Invalid Authorization header");
	}

	const token = authHeader.substring("Bearer ".length);

	const authContext = await AuthHandler.getAuthContext(token);

	if (!authContext || !(await AuthHandler.isValidAuthContext(authContext))) {
		if (isPublicAuthPath(path)) {
			AuthHandler.AuthContext.set(c, {
				type: "unauthenticated",
			} satisfies AuthHandler.UnauthenticatedAuthContext);

			return await next();
		}

		return APIResponse.unauthorized(c, "Invalid or expired token");
	}

	AuthHandler.AuthContext.set(c, authContext);

	return await next();
});

/** Unauthenticated requests may only reach the auth endpoints (docs/10-auth.md). */
function isPublicAuthPath(path: string) {
	return (
		path.startsWith("/v1/auth/login") ||
		path.startsWith("/v1/auth/callback") ||
		path.startsWith("/v1/auth/methods")
	);
}

/** Per-route middleware: require an authenticated admin session (401 / 403). */
export const requireAdmin = createMiddleware(async (c, next) => {
	const authContext = AuthHandler.AuthContext.get(c);

	if (authContext.type !== "session") {
		return APIResponse.unauthorized(c, "Authentication required");
	}
	if (authContext.user_role !== "admin") {
		return APIResponse.forbidden(c, "This endpoint is restricted to administrators");
	}

	await next();
});
