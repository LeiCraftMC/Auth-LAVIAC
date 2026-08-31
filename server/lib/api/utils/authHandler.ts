import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { DB } from "../../../db";
import type { OIDCHandler } from "../../../oidc/handler";
import { ConfigHandler } from "../../../utils/config";
import { Logger } from "../../../utils/logger";

export const SESSION_COOKIE = "laviac_session_token";

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

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
		let rows: DB.Models.Session[];
		try {
			rows = await DB.instance()
				.select()
				.from(DB.Tables.sessions)
				.where(eq(DB.Tables.sessions.hashed_token, hashToken(token)))
				.limit(1);
		} catch {
			// DB unavailable / not yet migrated — no session can be resolved.
			Logger.debug("Session lookup failed; treating as unauthenticated.");
			return { type: "unauthenticated" };
		}

		const row = rows[0];
		if (!row || row.expires_at <= now) {
			if (row) {
				// proactively purge the expired row
				await DB.instance().delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, row.id));
			}
			return { type: "unauthenticated" };
		}

		return {
			type: "session",
			sessionId: row.id,
			sub: row.zitadel_sub,
			email: row.zitadel_email,
			name: row.zitadel_name,
			isAdmin: row.user_role === "admin",
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

	/** Create a session row from a successful OIDC callback. Returns the opaque token. */
	static async createSession(info: OIDCHandler.SessionInfo, isAdmin: boolean): Promise<string> {
		const config = ConfigHandler.getConfig();
		const ttlHours = config.LAVIAC_SESSION_TTL_HOURS ? Number(config.LAVIAC_SESSION_TTL_HOURS) : 12;
		const token = randomBytes(32).toString("hex");

		await DB.instance()
			.insert(DB.Tables.sessions)
			.values({
				hashed_token: hashToken(token),
				zitadel_sub: info.sub,
				zitadel_email: (info.userinfo.email as string | undefined) ?? null,
				zitadel_name:
					(info.userinfo.name as string | undefined) ??
					(info.userinfo.preferred_username as string | undefined) ??
					null,
				user_role: isAdmin ? "admin" : "member",
				expires_at: Date.now() + ttlHours * 60 * 60 * 1000,
			});

		return token;
	}

	static async deleteSession(token: string): Promise<void> {
		await DB.instance()
			.delete(DB.Tables.sessions)
			.where(eq(DB.Tables.sessions.hashed_token, hashToken(token)));
	}

	static async cleanupExpired(): Promise<void> {
		await DB.instance()
			.delete(DB.Tables.sessions)
			.where(and(lt(DB.Tables.sessions.expires_at, Date.now())));
		Logger.debug("Expired sessions purged.");
	}
}
