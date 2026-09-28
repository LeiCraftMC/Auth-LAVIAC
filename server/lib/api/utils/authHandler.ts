/**
 * AuthHandler — opaque bearer-token sessions (docs/10-auth.md).
 *
 * Tokens have the shape `<prefix>_sess_<id>:<base>`:
 *   - `id`   — 32 random bytes hex; the `sessions` row primary key, so the lookup is O(1).
 *   - `base` — 32 random bytes hex; stored only as a `Bun.password` hash and returned to
 *     the client exactly once (browser cookie / bearer header).
 * Nothing in the token is meaningful to a client and nothing signed is trusted — the
 * token is re-resolved against the DB on every request.
 */
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { DB } from "../../db";
import { ConfigHandler } from "../../utils/config";
import { AppConstants } from "../../utils/constants";
import { Logger } from "../../utils/logger";
import type { UserAccountSettings } from "./shared-models/accountData";

export const SESSION_COOKIE = `${AppConstants.APP_KEYS_PREFIX}_session_token`;

/** A user as resolved by a login method, normalized before a session row is written. */
export interface SessionUser {
	sub: string;
	email: string | null;
	name: string | null;
	role: UserAccountSettings.Role;
	method: UserAccountSettings.LoginMethod;
}

/** What `SessionHandler.createSession` hands back — the full token is included once. */
export interface CreatedSession {
	token: string;
	expires_at: number;
}

export namespace AuthHandler {
	export type AuthContext =
		| {
				type: "session";
				/** Opaque token id — the `sessions` row primary key. */
				id: string;
				user_sub: string;
				user_email: string | null;
				user_name: string | null;
				user_role: UserAccountSettings.Role;
				login_method: UserAccountSettings.LoginMethod;
		  }
		| { type: "unauthenticated" };
}

/** Token primitives — generate, join, hash and verify (docs/10-auth.md). */
export class AuthUtils {
	static createRandomTokenID() {
		return randomBytes(32).toString("hex");
	}

	static createBaseToken() {
		return randomBytes(32).toString("hex");
	}

	static getFullToken(prefix: string, tokenID: string, tokenBase: string) {
		return `${prefix}${tokenID}:${tokenBase}`;
	}

	static hashTokenBase(tokenBase: string) {
		return Bun.password.hash(tokenBase);
	}

	static verifyHashedTokenBase(tokenBase: string, hashedToken: string) {
		return Bun.password.verify(tokenBase, hashedToken);
	}
}

/** Session lifecycle — create, invalidate, purge. */
export class SessionHandler {
	static readonly SESSION_TOKEN_PREFIX = `${AppConstants.APP_KEYS_PREFIX}_sess_`;

	/** Split a full token into `{ id, base }`; null when the shape or prefix is wrong. */
	static parseToken(token: string): { id: string; base: string } | null {
		if (!token.startsWith(this.SESSION_TOKEN_PREFIX)) return null;
		const rest = token.slice(this.SESSION_TOKEN_PREFIX.length);
		const separator = rest.indexOf(":");
		if (separator <= 0) return null;
		return { id: rest.slice(0, separator), base: rest.slice(separator + 1) };
	}

	/** Create a session row for a verified user; the full token is returned exactly once. */
	static async createSession(user: SessionUser): Promise<CreatedSession> {
		const config = ConfigHandler.getConfig();
		// docs/10-auth.md default: sessions expire after 7 days (deleted on access once expired).
		const ttlHours = config.LAVIAC_SESSION_TTL_HOURS
			? Number(config.LAVIAC_SESSION_TTL_HOURS)
			: 7 * 24;

		const tokenID = AuthUtils.createRandomTokenID();
		const tokenBase = AuthUtils.createBaseToken();
		const expires_at = Date.now() + ttlHours * 60 * 60 * 1000;

		await DB.instance()
			.insert(DB.Tables.sessions)
			.values({
				id: tokenID,
				hashed_token: await AuthUtils.hashTokenBase(tokenBase),
				user_sub: user.sub,
				user_email: user.email,
				user_name: user.name,
				user_role: user.role,
				login_method: user.method,
				expires_at,
			});

		return {
			token: AuthUtils.getFullToken(this.SESSION_TOKEN_PREFIX, tokenID, tokenBase),
			expires_at,
		};
	}

	static async inValidateSession(tokenID: string): Promise<void> {
		await DB.instance().delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, tokenID));
	}

	static async cleanupExpired(): Promise<void> {
		await DB.instance()
			.delete(DB.Tables.sessions)
			.where(lt(DB.Tables.sessions.expires_at, Date.now()));
		Logger.debug("Expired sessions purged.");
	}
}

export class AuthHandler {
	static async resolveRequest(c: Context): Promise<AuthHandler.AuthContext> {
		const token = AuthHandler.extractToken(c);
		if (!token) return { type: "unauthenticated" };

		const parsed = SessionHandler.parseToken(token);
		if (!parsed) return { type: "unauthenticated" };

		let row: DB.Models.Session | undefined;
		try {
			const rows = await DB.instance()
				.select()
				.from(DB.Tables.sessions)
				.where(eq(DB.Tables.sessions.id, parsed.id))
				.limit(1);
			row = rows[0];
		} catch {
			// DB unavailable / not yet migrated — no session can be resolved.
			Logger.debug("Session lookup failed; treating as unauthenticated.");
			return { type: "unauthenticated" };
		}

		if (!row) return { type: "unauthenticated" };

		if (row.expires_at <= Date.now()) {
			// purge the expired row on access (docs/10-auth.md)
			await SessionHandler.inValidateSession(row.id);
			return { type: "unauthenticated" };
		}

		if (!(await AuthUtils.verifyHashedTokenBase(parsed.base, row.hashed_token))) {
			return { type: "unauthenticated" };
		}

		return {
			type: "session",
			id: row.id,
			user_sub: row.user_sub,
			user_email: row.user_email,
			user_name: row.user_name,
			user_role: row.user_role,
			login_method: row.login_method,
		};
	}

	/**
	 * Read the authContext that the global middleware stashed on the request.
	 * The Hono app is untyped (a typed Variables generic conflicts with
	 * APIVersionRouter's `HonoBase` routes), so the value is read dynamically.
	 */
	static getAuthContext(c: Context): AuthHandler.AuthContext {
		return (
			((c as any).get("authContext") as AuthHandler.AuthContext | undefined) ?? {
				type: "unauthenticated",
			}
		);
	}

	/** Stash the authContext on the request for handlers to read via `getAuthContext`. */
	static setAuthContext(c: Context, ctx: AuthHandler.AuthContext): void {
		(c as any).set("authContext", ctx);
	}

	private static extractToken(c: Context): string | null {
		const header = c.req.header("Authorization") ?? "";
		if (header.startsWith("Bearer ")) {
			return header.slice(7);
		}
		const cookie = getCookie(c, SESSION_COOKIE);
		return cookie ?? null;
	}
}
