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
 * The static login is hardened per docs/10-auth.md: timing-safe dummy-hash verify and an
 * in-memory rate limiter (per-IP-per-username + globally per username).
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { validator as zValidator } from "hono-openapi";
import * as oidc from "openid-client";
import { OIDCHandler } from "../../../../../oidc/handler";
import { ConfigHandler } from "../../../../../utils/config";
import { Logger } from "../../../../../utils/logger";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler, SESSION_COOKIE, SessionHandler } from "../../../../utils/authHandler";
import { AttemptRateLimiter } from "../../../../utils/rateLimiter";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { AuthModel } from "./model";

const app = new Hono();

const OAUTH_STATE_COOKIE = "laviac_oidc_state";
const OAUTH_NONCE_COOKIE = "laviac_oidc_nonce";
const OAUTH_VERIFIER_COOKIE = "laviac_oidc_verifier";
const OAUTH_REDIRECT_COOKIE = "laviac_oidc_redirect";
const TEN_MINUTES = 60 * 10;

/** Static fallback login hardening (docs/10-auth.md). */
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginRateLimiter = new AttemptRateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, 60 * 1000);

/**
 * Precomputed hash for timing-safe verification when the username does not match, so a
 * missing user takes the same time as a wrong password (prevents username enumeration).
 */
const DUMMY_PASSWORD_HASH = await Bun.password.hash(randomBytes(32).toString("hex"));

function isSecure(): boolean {
	const appUrl = ConfigHandler.getConfig().LAVIAC_APP_URL ?? "";
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
 * unless the browser should remember the session (docs/10-auth.md).
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
	const appUrl = (ConfigHandler.getConfig().LAVIAC_APP_URL ?? "").replace(/\/$/, "");
	return `${appUrl}/api/v1/auth/callback`;
}

app.get(
	"/auth/login",
	APIRouteSpec.unauthenticated({
		summary: "Begin OIDC login",
		description: "Redirects to the Zitadel authorization endpoint (Authorization Code + PKCE).",
		tags: [DOCS_TAGS.AUTH],
		responses: { 302: { description: "Redirect to the Zitadel authorization endpoint." } },
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

app.get(
	"/auth/callback",
	APIRouteSpec.unauthenticated({
		summary: "OIDC callback",
		description:
			"Exchanges the authorization code for tokens, checks the admin project role, creates a session, and redirects to the app.",
		tags: [DOCS_TAGS.AUTH],
		responses: { 302: { description: "Redirect to the app; session cookie set on success." } },
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

			const adminRole = ConfigHandler.getConfig().LAVIAC_OIDC_ADMIN_ROLE ?? "laviac_admin";
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

app.post(
	"/auth/login",
	zValidator("json", AuthModel.Login.Body),
	APIRouteSpec.unauthenticated({
		summary: "Static fallback login",
		description:
			"Authenticates the env-configured static admin account (LAVIAC_STATIC_AUTH_USERNAME / LAVIAC_STATIC_AUTH_PASSWORD_HASH). Only available when a password hash is configured; rate-limited.",
		tags: [DOCS_TAGS.AUTH],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Login successful", AuthModel.Login.Response),
			APIResponseSpec.unauthorized("Invalid username or password"),
			APIResponseSpec.tooManyRequests("Too many login attempts. Try again later."),
		),
	}),
	async (c) => {
		const { username, password } = c.req.valid("json");
		const config = ConfigHandler.getConfig();
		const hash = config.LAVIAC_STATIC_AUTH_PASSWORD_HASH;
		const staticUsername = config.LAVIAC_STATIC_AUTH_USERNAME ?? "admin";
		const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
		const ipKey = `ip:${ip}:${username}`;
		const userKey = `user:${username}`;
		const keys = [ipKey, userKey];

		if (keys.some((key) => loginRateLimiter.isLimited(key))) {
			c.header("Retry-After", String(loginRateLimiter.retryAfterSeconds(userKey)));
			return APIResponse.tooManyRequests(c, "Too many login attempts. Try again later.");
		}

		// Uniform failure: always burn one argon2 verification (timing-safe dummy hash) and
		// never reveal whether static login is configured or which part failed.
		const fail = async () => {
			await Bun.password.verify(password, DUMMY_PASSWORD_HASH);
			return APIResponse.unauthorized(c, "Invalid username or password");
		};

		if (!hash || username !== staticUsername) {
			for (const key of keys) loginRateLimiter.recordFailure(key);
			return await fail();
		}

		let valid = false;
		try {
			valid = await Bun.password.verify(password, hash);
		} catch (err) {
			Logger.error("Static auth: LAVIAC_STATIC_AUTH_PASSWORD_HASH is not a valid hash:", err);
			return APIResponse.serverError(c, "Static login is misconfigured. Check the server logs.");
		}
		if (!valid) {
			for (const key of keys) loginRateLimiter.recordFailure(key);
			return await fail();
		}

		for (const key of keys) loginRateLimiter.clear(key);
		const session = await SessionHandler.createSession({
			sub: staticUsername,
			email: null,
			name: staticUsername,
			role: "admin",
			method: "static",
		});
		Logger.info(`Static login succeeded for "${staticUsername}" (ip: ${ip}).`);
		return APIResponse.success(c, "Login successful", session);
	},
);

app.get(
	"/auth/methods",
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
			oidc: Boolean(
				config.LAVIAC_ZITADEL_URL &&
					config.LAVIAC_OIDC_CLIENT_ID &&
					config.LAVIAC_OIDC_CLIENT_SECRET,
			),
			static: Boolean(config.LAVIAC_STATIC_AUTH_PASSWORD_HASH),
		});
	},
);

app.post(
	"/auth/logout",
	APIRouteSpec.authenticated({
		summary: "Log out",
		description: "Destroys the current session and clears the session cookie.",
		tags: [DOCS_TAGS.AUTH],
		responses: APIResponseSpec.describeBasic(APIResponseSpec.successNoData("Logout successful")),
	}),
	async (c) => {
		const ctx = AuthHandler.getAuthContext(c);
		if (ctx.type === "session") {
			await SessionHandler.inValidateSession(ctx.id);
		}
		deleteCookie(c, SESSION_COOKIE, { path: "/" });
		return APIResponse.successNoData(c, "Logout successful");
	},
);

app.get(
	"/auth/me",
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
		const ctx = AuthHandler.getAuthContext(c);
		if (ctx.type !== "session") {
			return APIResponse.unauthorized(c, "Not authenticated");
		}
		return APIResponse.success(c, "Current user", {
			sub: ctx.user_sub,
			email: ctx.user_email,
			name: ctx.user_name,
			role: ctx.user_role,
			login_method: ctx.login_method,
		});
	},
);

export const authRouter = app;
