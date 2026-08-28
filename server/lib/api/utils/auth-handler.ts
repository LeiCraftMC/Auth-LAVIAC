/**
 * AuthHandler — resolves the bearer/cookie session token into an AuthContext.
 *
 * Sessions are created in the OIDC callback route and stored in the `sessions` table.
 * The opaque `token` is carried in the `laviac_session_token` cookie, which the frontend
 * `useAPI` composable forwards as `Authorization: Bearer <token>`. Adapted from
 * Style-Guides shared/backend/auth-handler.example.ts (docs/10-auth.md).
 */
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { DB } from "../../../db";
import { sessions } from "../../../db/schema";
import type { OIDCSessionInfo } from "../../../oidc/handler";
import { ConfigHandler } from "../../../utils/config";
import { Logger } from "../../../utils/logger";

export const SESSION_COOKIE = "laviac_session_token";

export namespace AuthHandler {
	export type AuthContext =
		| {
				type: "session";
				sessionId: number;
				sub: string;
				email: string | null;
				name: string | null;
				isAdmin: boolean;
		  }
		| { type: "unauthenticated" };
}

export class AuthHandler {
	static async resolveRequest(c: Context): Promise<AuthHandler.AuthContext> {
		const token = AuthHandler.extractToken(c);
		if (!token) return { type: "unauthenticated" };

		const now = Date.now();
		let row: DB.Models.Session | undefined;
		try {
			row = await DB.instance().query.sessions.findFirst({ where: eq(sessions.token, token) });
		} catch {
			// DB unavailable / not yet migrated — no session can be resolved.
			Logger.debug("Session lookup failed; treating as unauthenticated.");
			return { type: "unauthenticated" };
		}

		if (!row || row.expiresAt <= now) {
			if (row) {
				// proactively purge the expired row
				await DB.instance().delete(sessions).where(eq(sessions.id, row.id));
			}
			return { type: "unauthenticated" };
		}

		return {
			type: "session",
			sessionId: row.id,
			sub: row.zitadelSub,
			email: row.zitadelEmail,
			name: row.zitadelName,
			isAdmin: row.isAdmin,
		};
	}

	/**
	 * Read the authContext that the global middleware stashed on the request.
	 * The Hono app is untyped (see docs/03 — a typed Variables generic conflicts with
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

	/** Create a session row from a successful OIDC callback. Returns the opaque token. */
	static async createSession(info: OIDCSessionInfo, isAdmin: boolean): Promise<string> {
		const config = ConfigHandler.getConfig();
		const ttlHours = config.LAVIAC_SESSION_TTL_HOURS ? Number(config.LAVIAC_SESSION_TTL_HOURS) : 12;
		const token = randomBytes(32).toString("hex");
		const now = Date.now();

		await DB.instance()
			.insert(sessions)
			.values({
				token,
				zitadelSub: info.sub,
				zitadelEmail: (info.userinfo.email as string | undefined) ?? null,
				zitadelName:
					(info.userinfo.name as string | undefined) ??
					(info.userinfo.preferred_username as string | undefined) ??
					null,
				isAdmin,
				expiresAt: now + ttlHours * 60 * 60 * 1000,
			});

		return token;
	}

	static async deleteSession(token: string): Promise<void> {
		await DB.instance().delete(sessions).where(eq(sessions.token, token));
	}

	static async cleanupExpired(): Promise<void> {
		const now = Date.now();
		await DB.instance().delete(sessions).where(lt(sessions.expiresAt, now));
		Logger.debug("Expired sessions purged.");
	}
}
