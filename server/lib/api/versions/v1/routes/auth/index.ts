/**
 * Auth routes — Zitadel OIDC (Authorization Code + PKCE).
 *
 *   GET  /auth/login     → redirect to Zitadel authorize endpoint
 *   GET  /auth/callback  → exchange code, check admin role, set session cookie, redirect to /
 *   POST /auth/logout    → destroy session, clear cookie, redirect to /auth/login
 *   GET  /auth/me        → current admin user
 *
 * State / nonce / PKCE verifier are round-tripped in short-lived HttpOnly cookies.
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as oidc from "openid-client";
import { OIDCHandler } from "../../../../../../oidc/handler";
import { ConfigHandler } from "../../../../../../utils/config";
import { Logger } from "../../../../../../utils/logger";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler, SESSION_COOKIE } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { AuthModel } from "./model";

const app = new Hono();

const OAUTH_STATE_COOKIE = "laviac_oidc_state";
const OAUTH_NONCE_COOKIE = "laviac_oidc_nonce";
const OAUTH_VERIFIER_COOKIE = "laviac_oidc_verifier";
const OAUTH_REDIRECT_COOKIE = "laviac_oidc_redirect";
const TEN_MINUTES = 60 * 10;

function isSecure(): boolean {
	const appUrl = ConfigHandler.getConfig().LAVIAC_APP_URL ?? "";
	return appUrl.startsWith("https://");
}

function cookieOptions(maxAge: number) {
	return {
		httpOnly: true,
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

		setCookie(c, OAUTH_STATE_COOKIE, state, cookieOptions(TEN_MINUTES));
		setCookie(c, OAUTH_NONCE_COOKIE, nonce, cookieOptions(TEN_MINUTES));
		setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions(TEN_MINUTES));

		const returnUrl = c.req.query("url") ?? "/";
		setCookie(c, OAUTH_REDIRECT_COOKIE, returnUrl, cookieOptions(TEN_MINUTES));

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

			const token = await AuthHandler.createSession(info, true);
			setCookie(c, SESSION_COOKIE, token, cookieOptions(60 * 60 * 24 * 7));
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
	"/auth/logout",
	APIRouteSpec.unauthenticated({
		summary: "Log out",
		description: "Destroys the current session and clears the session cookie.",
		tags: [DOCS_TAGS.AUTH],
		responses: APIResponseSpec.describeBasic(APIResponseSpec.successNoData("Logout successful")),
	}),
	async (c) => {
		const token = getCookie(c, SESSION_COOKIE);
		if (token) {
			await AuthHandler.deleteSession(token);
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
			sub: ctx.sub,
			email: ctx.email,
			name: ctx.name,
			isAdmin: ctx.isAdmin,
		});
	},
);

export const authRouter = app;
