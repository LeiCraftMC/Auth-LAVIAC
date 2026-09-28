/**
 * Auth routes — Zitadel OIDC (Authorization Code + PKCE) + static fallback login.
 *
 *   GET  /auth/login     → redirect to Zitadel authorize endpoint (OIDC)
 *   POST /auth/login     → static credential login (env-configured admin account)
 *   GET  /auth/callback  → exchange code, check admin role, set session cookie, redirect
 *   GET  /auth/methods   → which login methods are configured (login-page discovery)
 *   POST /auth/logout    → destroy session, clear cookie
 *   GET  /auth/me        → current admin user
 *
 * State / nonce / PKCE verifier are round-tripped in short-lived HttpOnly cookies.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { validator as zValidator } from "hono-openapi";
import * as oidc from "openid-client";
import { OIDCHandler } from "../../../../../oidc/handler";
import { ConfigHandler } from "../../../../../utils/config";
import { Logger } from "../../../../../utils/logger";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler, SESSION_COOKIE, SessionHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { AuthModel } from "./model";

// Dummy Bun.password hash for timing-normalized login failures — prevents username enumeration
// Generated once at module load so it's a valid, cost-equivalent hash
const DUMMY_PASSWORD_HASH = await Bun.password.hash("dummy-timing-constant");

// Simple in-memory rate limiter for login to reduce brute-force risk
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_MAX_GLOBAL_ATTEMPTS = 15; // Per-username limit across all IPs
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const globalLoginAttempts = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to prevent unbounded memory growth — runs every 5 minutes
const LOGIN_CLEANUP_INTERVAL = setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of loginAttempts) {
		if (entry.resetAt <= now) loginAttempts.delete(key);
	}
	for (const [key, entry] of globalLoginAttempts) {
		if (entry.resetAt <= now) globalLoginAttempts.delete(key);
	}
}, LOGIN_WINDOW_MS);
// Allow the process to exit without waiting for this interval
LOGIN_CLEANUP_INTERVAL.unref();

function getClientId(c: Context) {
	// bun/hono provides a native request with connection info
	const remote = (c.req.raw as any)?.remoteAddr?.hostname;
	return remote || "unknown";
}

function getLoginAttemptKey(clientId: string, username: string) {
	return `${clientId}:${username.toLowerCase()}`;
}

function getGlobalLoginAttemptKey(username: string) {
	return username.toLowerCase();
}

/**
 * Register a failed attempt, incrementing the counter atomically.
 * Returns the new count after increment — no await between read and write.
 */
function registerFailedLoginAttempt(
	loginAttemptKey: string,
	globalKey: string,
): { perIpCount: number; globalCount: number } {
	const now = Date.now();

	// Per-client-per-username counter
	let entry = loginAttempts.get(loginAttemptKey);
	if (!entry || entry.resetAt <= now) {
		entry = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
		loginAttempts.set(loginAttemptKey, entry);
	} else {
		entry.count += 1;
	}

	// Global per-username counter
	let globalEntry = globalLoginAttempts.get(globalKey);
	if (!globalEntry || globalEntry.resetAt <= now) {
		globalEntry = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
		globalLoginAttempts.set(globalKey, globalEntry);
	} else {
		globalEntry.count += 1;
	}

	return { perIpCount: entry.count, globalCount: globalEntry.count };
}

function clearFailedLoginAttempts(loginAttemptKey: string, globalKey: string) {
	loginAttempts.delete(loginAttemptKey);
	globalLoginAttempts.delete(globalKey);
}

export const router = new Hono().basePath("/auth");

const OAUTH_STATE_COOKIE = "laviac_oidc_state";
const OAUTH_NONCE_COOKIE = "laviac_oidc_nonce";
const OAUTH_VERIFIER_COOKIE = "laviac_oidc_verifier";
const OAUTH_REDIRECT_COOKIE = "laviac_oidc_redirect";
const TEN_MINUTES = 60 * 10;

function isSecure(): boolean {
	const appUrl = ConfigHandler.getConfig()?.APP_URL ?? "";
	return appUrl.startsWith("https://");
}

/** Short-lived HttpOnly cookies for the OIDC state/nonce/verifier round-trip. */
function httpCookieOptions(maxAge: number) {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "lax" as const,
		secure: isSecure(),
		maxAge,
	};
}

/**
 * Session-token cookie. docs/10-auth.md: `httpOnly: false` — the client must read the
 * token to attach it as `Authorization: Bearer` via `updateAPIClient`. No `maxAge`
 * unless the browser should remember the session.
 */
function sessionCookieOptions(maxAge?: number) {
	return {
		httpOnly: false,
		path: "/",
		sameSite: "lax" as const,
		secure: isSecure(),
		maxAge,
	};
}

function redirectUri(): string {
	const appUrl = (ConfigHandler.getConfig()?.APP_URL ?? "").replace(/\/$/, "");
	return `${appUrl}/api/v1/auth/callback`;
}

router.get(
	"/login",

	APIRouteSpec.unauthenticated({
		summary: "Begin OIDC login",
		description: "Redirects to the Zitadel authorization endpoint (Authorization Code + PKCE).",
		tags: [DOCS_TAGS.AUTH],

		responses: {
			302: {
				description: "Redirect to the Zitadel authorization endpoint.",
			},
		},
	}),

	async (c) => {
		const state = oidc.randomState();
		const nonce = oidc.randomNonce();
		const codeVerifier = oidc.randomPKCECodeVerifier();

		setCookie(c, OAUTH_STATE_COOKIE, state, httpCookieOptions(TEN_MINUTES));
		setCookie(c, OAUTH_NONCE_COOKIE, nonce, httpCookieOptions(TEN_MINUTES));
		setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, httpCookieOptions(TEN_MINUTES));

		const returnUrl = c.req.query("url") ?? "/";
		setCookie(c, OAUTH_REDIRECT_COOKIE, returnUrl, httpCookieOptions(TEN_MINUTES));

		const url = await OIDCHandler.getAuthorizationUrl({
			redirectUri: redirectUri(),
			state,
			nonce,
			codeVerifier,
		});
		return c.redirect(url, 302);
	},
);

router.get(
	"/callback",

	APIRouteSpec.unauthenticated({
		summary: "OIDC callback",
		description:
			"Exchanges the authorization code for tokens, checks the admin project role, creates a session, and redirects to the app.",
		tags: [DOCS_TAGS.AUTH],

		responses: {
			302: {
				description: "Redirect to the app; session cookie set on success.",
			},
		},
	}),

	async (c) => {
		const state = getCookie(c, OAUTH_STATE_COOKIE) ?? "";
		const nonce = getCookie(c, OAUTH_NONCE_COOKIE) ?? "";
		const verifier = getCookie(c, OAUTH_VERIFIER_COOKIE) ?? "";
		const returnUrl = getCookie(c, OAUTH_REDIRECT_COOKIE) ?? "/";

		const callbackUrl = new URL(c.req.url).href;

		try {
			const info = await OIDCHandler.handleCallback(callbackUrl, {
				expectedState: state,
				expectedNonce: nonce,
				pkceCodeVerifier: verifier,
			});

			const adminRole = ConfigHandler.getConfig()?.OIDC_ADMIN_ROLE ?? "laviac_admin";
			const isAdmin = OIDCHandler.isAdmin(info, adminRole);

			if (!isAdmin) {
				Logger.warn(`OIDC user ${info.sub} lacks the ${adminRole} role — access denied.`);
				return c.redirect(`/auth/login?error=forbidden`, 302);
			}

			const session = await SessionHandler.createSession({
				sub: info.sub,
				email: (info.userinfo.email as string | undefined) ?? null,
				name:
					(info.userinfo.name as string | undefined) ??
					(info.userinfo.preferred_username as string | undefined) ??
					null,
				role: "admin",
				method: "oidc",
			});
			setCookie(c, SESSION_COOKIE, session.token, sessionCookieOptions());
		} catch (err) {
			Logger.error("OIDC callback failed:", err);
			return c.redirect(`/auth/login?error=auth_failed`, 302);
		}

		// clear the round-trip cookies
		for (const name of [
			OAUTH_STATE_COOKIE,
			OAUTH_NONCE_COOKIE,
			OAUTH_VERIFIER_COOKIE,
			OAUTH_REDIRECT_COOKIE,
		]) {
			deleteCookie(c, name, { path: "/" });
		}

		return c.redirect(returnUrl, 302);
	},
);

router.post(
	"/login",

	APIRouteSpec.unauthenticated({
		summary: "Static fallback login",
		description:
			"Authenticates the env-configured static admin account (LAVIAC_STATIC_AUTH_USERNAME / LAVIAC_STATIC_AUTH_PASSWORD_HASH — required at boot). Rate-limited.",
		tags: [DOCS_TAGS.AUTH],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Login successful", AuthModel.Login.Response),
			APIResponseSpec.unauthorized("Unauthorized: Invalid username or password"),
			APIResponseSpec.tooManyRequests("Too many login attempts. Try again later."),
		),
	}),

	zValidator("json", AuthModel.Login.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.get(c) as AuthHandler.UnauthenticatedAuthContext;
		if (authContext.type !== "unauthenticated") {
			return APIResponse.forbidden(c, "You are already authenticated");
		}

		const { username, password } = c.req.valid("json");

		try {
			const clientId = getClientId(c);
			const loginAttemptKey = getLoginAttemptKey(clientId, username);
			const globalKey = getGlobalLoginAttemptKey(username);

			// Increment counters FIRST, then check limits — eliminates TOCTOU race
			const { perIpCount, globalCount } = registerFailedLoginAttempt(loginAttemptKey, globalKey);

			if (perIpCount > LOGIN_MAX_ATTEMPTS || globalCount > LOGIN_MAX_GLOBAL_ATTEMPTS) {
				const retrySeconds = Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000));
				c.header("Retry-After", retrySeconds.toString());
				return APIResponse.tooManyRequests(c, `Too many login attempts. Try again in ${retrySeconds}s`);
			}

			const config = ConfigHandler.getConfig();
			const hash = config?.STATIC_AUTH_PASSWORD_HASH;
			const staticUsername = config?.STATIC_AUTH_USERNAME ?? "admin";

			if (!hash || username !== staticUsername) {
				// Timing-normalized: always run a Bun.password call to prevent username enumeration
				await Bun.password.verify(password, DUMMY_PASSWORD_HASH);
				return APIResponse.unauthorized(c, "Invalid username or password");
			}

			const passwordMatch = await Bun.password.verify(password, hash);
			if (!passwordMatch) {
				return APIResponse.unauthorized(c, "Invalid username or password");
			}

			// Successful login — clear all counters for this user
			clearFailedLoginAttempts(loginAttemptKey, globalKey);

			const session = await SessionHandler.createSession({
				sub: staticUsername,
				email: null,
				name: staticUsername,
				role: "admin",
				method: "static",
			});

			Logger.info(`Static login succeeded for "${staticUsername}" (client: ${clientId}).`);

			return APIResponse.success(c, "Login successful", session satisfies AuthModel.Login.Response);
		} catch (error: any) {
			Logger.error("Failed to create session", error.stack || error.message || error);
			return APIResponse.serverError(c, "Failed to create session");
		}
	},
);

router.get(
	"/methods",

	APIRouteSpec.unauthenticated({
		summary: "Available authentication methods",
		description:
			"Reports which login methods are configured, so the login page can render the right forms.",
		tags: [DOCS_TAGS.AUTH],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Authentication methods", AuthModel.Methods.Response),
		),
	}),

	(c) => {
		const config = ConfigHandler.getConfig();
		return APIResponse.success(c, "Authentication methods", {
			oidc: Boolean(config?.ZITADEL_AUTH_URL && config?.OIDC_CLIENT_ID && config?.OIDC_CLIENT_SECRET),
			static: Boolean(config?.STATIC_AUTH_PASSWORD_HASH),
		} satisfies AuthModel.Methods.Response);
	},
);

router.post(
	"/logout",

	APIRouteSpec.authenticated({
		summary: "Log out",
		description: "Invalidate the current session and clear the session cookie.",
		tags: [DOCS_TAGS.AUTH],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Logout successful"),
			APIResponseSpec.unauthorized(
				"Unauthorized: Invalid or missing session token / Your Auth Context is not a session",
			),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.get(c);

		if (authContext.type !== "session") {
			return APIResponse.unauthorized(c, "Your Auth Context is not a session");
		}

		await SessionHandler.inValidateSession(authContext.id);

		// LAVIAC: the OIDC callback sets this cookie server-side, so it is cleared here too.
		deleteCookie(c, SESSION_COOKIE, { path: "/" });

		return APIResponse.successNoData(c, "Logout successful");
	},
);

router.get(
	"/me",

	APIRouteSpec.authenticated({
		summary: "Current admin user",
		description: "Returns the authenticated admin user, or an error if not signed in.",
		tags: [DOCS_TAGS.AUTH],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Current user", AuthModel.Me.Response),
			APIResponseSpec.unauthorized("Not authenticated"),
		),
	}),

	(c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);

		if (authContext.type !== "session") {
			return APIResponse.unauthorized(c, "Not authenticated");
		}

		return APIResponse.success(c, "Current user", {
			sub: authContext.user_sub,
			email: authContext.user_email,
			name: authContext.user_name,
			role: authContext.user_role,
			login_method: authContext.login_method,
		} satisfies AuthModel.Me.Response);
	},
);
