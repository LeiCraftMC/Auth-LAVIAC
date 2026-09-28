/**
 * OIDCHandler — Zitadel OpenID Connect (Authorization Code + PKCE).
 *
 * LAVIAC is a confidential OIDC client of the LeiCraft_MC Auth Zitadel instance.
 * Admins sign in through Zitadel; the backend exchanges the code for tokens, reads the
 * userinfo, and checks the configured project role to grant dashboard access.
 *
 * This is a project-specific divergence from Style-Guides docs/10 (which covers opaque
 * bearer sessions only) — recorded in CLAUDE.md / AGENTS.md. Uses `openid-client` v6.
 */
import * as oidc from "openid-client";
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";

const ZITADEL_ROLES_CLAIM = "urn:zitadel:iam:org:project:roles";

export class OIDCHandler {
	private static config: oidc.Configuration | null = null;

	static async ensureConfig(): Promise<oidc.Configuration> {
		if (OIDCHandler.config) return OIDCHandler.config;
		const c = ConfigHandler.getConfig();
		const issuer = (c.LAVIAC_ZITADEL_URL ?? "").replace(/\/$/, "");
		const clientId = c.LAVIAC_OIDC_CLIENT_ID;
		const clientSecret = c.LAVIAC_OIDC_CLIENT_SECRET;
		if (!clientId || !issuer) {
			throw new Error("LAVIAC_OIDC_CLIENT_ID and LAVIAC_ZITADEL_URL must be set for OIDC.");
		}
		Logger.log(`Discovering Zitadel OIDC issuer at ${issuer}...`);
		OIDCHandler.config = await oidc.discovery(new URL(issuer), clientId, clientSecret);
		Logger.log("Zitadel OIDC discovery complete.");
		return OIDCHandler.config;
	}

	static async getAuthorizationUrl(params: {
		redirectUri: string;
		state: string;
		nonce: string;
		codeVerifier: string;
	}): Promise<string> {
		const cfg = await OIDCHandler.ensureConfig();
		const codeChallenge = await oidc.calculatePKCECodeChallenge(params.codeVerifier);
		return oidc
			.buildAuthorizationUrl(cfg, {
				redirect_uri: params.redirectUri,
				scope: "openid profile email offline_access",
				state: params.state,
				nonce: params.nonce,
				code_challenge: codeChallenge,
				code_challenge_method: "S256",
			})
			.toString();
	}

	static async handleCallback(
		callbackUrl: string,
		checks: { expectedState: string; expectedNonce: string; pkceCodeVerifier: string },
	): Promise<OIDCHandler.SessionInfo> {
		const cfg = await OIDCHandler.ensureConfig();
		const tokens = await oidc.authorizationCodeGrant(cfg, new URL(callbackUrl), {
			expectedState: checks.expectedState,
			expectedNonce: checks.expectedNonce,
			pkceCodeVerifier: checks.pkceCodeVerifier,
		});

		const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
		const sub = (claims.sub as string | undefined) ?? "";
		const accessToken = tokens.access_token ?? "";

		// fetchUserInfo throws if the issuer doesn't expose one; fall back to claims.
		let userinfo: Record<string, unknown> = {};
		try {
			userinfo = (await oidc.fetchUserInfo(
				cfg,
				accessToken,
				sub || oidc.skipSubjectCheck,
			)) as Record<string, unknown>;
		} catch (err) {
			Logger.warn("fetchUserInfo failed; falling back to ID token claims.", err);
			userinfo = claims;
		}

		return {
			sub,
			accessToken,
			idToken: tokens.id_token,
			refreshToken: tokens.refresh_token,
			claims,
			userinfo,
		};
	}

	static async getEndSessionUrl(params: {
		idToken?: string;
		postLogoutRedirectUri: string;
	}): Promise<string> {
		const cfg = await OIDCHandler.ensureConfig();
		const parameters: Record<string, string> = {
			post_logout_redirect_uri: params.postLogoutRedirectUri,
		};
		if (params.idToken) {
			parameters.id_token_hint = params.idToken;
		}
		return oidc.buildEndSessionUrl(cfg, parameters).toString();
	}

	/** True if the user carries the configured Zitadel project role (admin). */
	static isAdmin(info: OIDCHandler.SessionInfo, adminRole: string): boolean {
		const roles = (info.userinfo[ZITADEL_ROLES_CLAIM] ??
			info.claims[ZITADEL_ROLES_CLAIM] ??
			{}) as Record<string, unknown>;
		return Object.hasOwn(roles, adminRole);
	}
}

export namespace OIDCHandler {
	export type SessionInfo = {
		sub: string;
		accessToken: string;
		idToken?: string;
		refreshToken?: string;
		claims: Record<string, unknown>;
		userinfo: Record<string, unknown>;
	};
}
