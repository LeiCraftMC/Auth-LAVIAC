import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { DB } from "../../db";
import type { DrizzleDB } from "../../db/utils";
import { ConfigHandler } from "../../utils/config";
import { AppConstants } from "../../utils/constants";
import type { UserAccountSettings } from "./shared-models/accountData";

// Opaque bearer-token auth. Token shape: `<prefix><id>:<base>`
//   prefix — SESSION_TOKEN_PREFIX (carries the kind)
//   id     — 32 random bytes hex; indexes the DB row
//   base   — 32 random bytes hex; stored ONLY as Bun.password.hash(...)
// The full token is handed to the client once at creation; the server re-resolves
// it against the DB on every request (no JWT, no signed claims).

/** LAVIAC: the session-token cookie set by the OIDC callback (docs/10-auth.md). */
export const SESSION_COOKIE = `${AppConstants.APP_KEYS_PREFIX}_session_token`;

/**
 * A user as resolved by a login method, normalized before a session row is written —
 * LAVIAC has no local users table: `sub` is the Zitadel subject (OIDC) or the
 * configured username (static fallback).
 */
export interface SessionUser {
	sub: string;
	email: string | null;
	name: string | null;
	role: UserAccountSettings.Role;
	method: UserAccountSettings.LoginMethod;
}

export class AuthUtils {
	/** 32 random bytes as a 64-char hex string — used as the token id (DB row key). */
	static createRandomTokenID() {
		return randomBytes(32).toString("hex");
	}

	/** 32 random bytes as a 64-char hex string — the secret half, stored only hashed. */
	static createBaseToken() {
		return randomBytes(32).toString("hex");
	}

	static getFullToken(prefix: AuthHandler.TOKEN_PREFIX, tokenID: string, tokenBase: string) {
		return `${prefix}${tokenID}:${tokenBase}`;
	}

	/** Split a full token into prefix/id/base, or null if the shape is wrong. */
	static getTokenParts(fullToken: string) {
		const parts = fullToken.split(":") as [string, string];
		if (parts.length !== 2) {
			return null;
		}
		if (parts[0].startsWith(SessionHandler.SESSION_TOKEN_PREFIX)) {
			return {
				prefix: SessionHandler.SESSION_TOKEN_PREFIX,
				id: parts[0].substring(SessionHandler.SESSION_TOKEN_PREFIX.length),
				base: parts[1],
			} satisfies AuthHandler.TokenParts;
		} else {
			return null;
		}
	}

	static hashTokenBase(tokenBase: string) {
		return Bun.password.hash(tokenBase);
	}

	static verifyHashedTokenBase(tokenBase: string, hashedToken: string) {
		return Bun.password.verify(tokenBase, hashedToken);
	}
}

export class SessionHandler {
	static readonly SESSION_TOKEN_PREFIX = `${AppConstants.APP_KEYS_PREFIX}_sess_`;

	static async createSession(user: SessionUser, tx: DrizzleDB = DB.instance()) {
		const tokenID = AuthUtils.createRandomTokenID();
		const tokenBase = AuthUtils.createBaseToken();

		const fullToken = AuthUtils.getFullToken(this.SESSION_TOKEN_PREFIX, tokenID, tokenBase);

		// docs/10-auth.md default: 7 days; LAVIAC_SESSION_TTL_HOURS overrides.
		const ttlHours = ConfigHandler.getConfig()?.SESSION_TTL_HOURS ?? 7 * 24;

		const result = await tx
			.insert(DB.Tables.sessions)
			.values({
				id: tokenID,
				hashed_token: await AuthUtils.hashTokenBase(tokenBase),
				user_sub: user.sub,
				user_email: user.email,
				user_name: user.name,
				user_role: user.role,
				login_method: user.method,
				expires_at: Date.now() + ttlHours * 60 * 60 * 1000,
			})
			.returning()
			.get();

		return {
			token: fullToken,
			user_sub: result.user_sub,
			user_email: result.user_email,
			user_name: result.user_name,
			user_role: result.user_role,
			login_method: result.login_method,
			created_at: result.created_at,
			expires_at: result.expires_at,
		} satisfies Omit<DB.Models.Session, "id" | "hashed_token"> & { token: string };
	}

	static async getSession(tokenParts: AuthHandler.TokenParts, tx: DrizzleDB = DB.instance()) {
		if (!tokenParts.prefix.startsWith(this.SESSION_TOKEN_PREFIX)) {
			return null;
		}

		const session = await tx
			.select()
			.from(DB.Tables.sessions)
			.where(eq(DB.Tables.sessions.id, tokenParts.id))
			.get();
		if (!session) {
			return null;
		}

		if (!(await AuthUtils.verifyHashedTokenBase(tokenParts.base, session.hashed_token))) {
			return null;
		}

		return session;
	}

	static async isValidSession(session: DB.Models.Session, tx: DrizzleDB = DB.instance()) {
		if (!session) {
			return false;
		}

		if (session.expires_at < Date.now()) {
			// Delete expired session
			await tx.delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, session.id));

			return false;
		}

		return true;
	}

	static async inValidateSession(tokenID: string, tx: DrizzleDB = DB.instance()) {
		await tx.delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, tokenID));
	}
}

export class AuthHandler {
	static getTokenType(token: string) {
		if (token.startsWith(SessionHandler.SESSION_TOKEN_PREFIX)) {
			return "session";
		} else {
			return "unknown";
		}
	}

	/** Resolve a bearer token into a session auth context, or null. */
	static async getAuthContext(
		fullToken: string,
		tx: DrizzleDB = DB.instance(),
	): Promise<AuthHandler.AuthenticatedAuthContext | null> {
		const tokenParts = AuthUtils.getTokenParts(fullToken);
		if (!tokenParts) {
			return null;
		}

		switch (this.getTokenType(fullToken)) {
			case "session": {
				const session = await SessionHandler.getSession(tokenParts, tx);
				if (!session) {
					return null;
				}
				return {
					type: "session" as const,
					...session,
				};
			}
			default:
				return null;
		}
	}

	static async isValidAuthContext(
		authContext: AuthHandler.AuthContext,
		tx: DrizzleDB = DB.instance(),
	): Promise<boolean> {
		switch (authContext.type) {
			case "session":
				return await SessionHandler.isValidSession(authContext, tx);
			default:
				return false;
		}
	}

	static async invalidateAuthContext(
		authContext: AuthHandler.AuthContext,
		tx: DrizzleDB = DB.instance(),
	): Promise<void> {
		switch (authContext.type) {
			case "session":
				await SessionHandler.inValidateSession(authContext.id, tx);
				break;
		}
	}
}

export namespace AuthHandler {
	export type TOKEN_PREFIX = typeof SessionHandler.SESSION_TOKEN_PREFIX;

	export type AuthenticatedAuthContext = SessionAuthContext;
	export type AuthContext = AuthenticatedAuthContext | UnauthenticatedAuthContext;

	export interface SessionAuthContext extends DB.Models.Session {
		readonly type: "session";
	}

	export interface UnauthenticatedAuthContext {
		readonly type: "unauthenticated";
	}

	export interface TokenParts {
		readonly prefix: TOKEN_PREFIX;
		readonly id: string;
		readonly base: string;
	}
}

export namespace AuthHandler.AuthContext {
	export function get(c: Context): AuthHandler.AuthContext {
		const authContext = c.get("authContext") as AuthHandler.AuthContext | undefined;
		if (!authContext) {
			throw new Error("Auth context not set in context");
		}
		return authContext;
	}

	export function getAsSession(c: Context): AuthHandler.SessionAuthContext {
		return AuthHandler.AuthContext.get(c) as AuthHandler.SessionAuthContext;
	}

	export function set(c: Context, authContext: AuthHandler.AuthContext) {
		return c.set("authContext", authContext);
	}
}
