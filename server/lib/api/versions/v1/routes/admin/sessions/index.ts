import { desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { Audit } from "../../../../../../utils/audit";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler, SessionHandler } from "../../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminSessionsModel } from "./model";

export const router = new Hono().basePath("/sessions");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List active sessions",
		description: "All unexpired LAVIAC sessions (OIDC and static logins), newest first.",
		tags: [DOCS_TAGS.ADMIN_API.SESSIONS],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Sessions retrieved successfully", AdminSessionsModel.GetAll.Response),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);

		const sessions = DB.instance()
			.select()
			.from(DB.Tables.sessions)
			.where(gt(DB.Tables.sessions.expires_at, Date.now()))
			.orderBy(desc(DB.Tables.sessions.created_at))
			.all();

		return APIResponse.success(
			c,
			"Sessions retrieved successfully",
			sessions.map(({ hashed_token: _hashedToken, ...session }) => ({
				...session,
				current: session.id === authContext.id,
			})) satisfies AdminSessionsModel.GetAll.Response,
		);
	},
);

router.delete(
	"/:sessionId",

	APIRouteSpec.authenticated({
		summary: "Revoke a session",
		description: "Sign a session out. Your own session is ended with logout instead.",
		tags: [DOCS_TAGS.ADMIN_API.SESSIONS],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Session revoked successfully"),
			APIResponseSpec.badRequest("Bad Request: Use logout to end your own session"),
			APIResponseSpec.notFound("Session not found"),
		),
	}),

	zValidator("param", AdminSessionsModel.SessionId.Params),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		// @ts-ignore - hono-openapi does not type "param" yet
		const { sessionId } = c.req.valid("param") as AdminSessionsModel.SessionId.Params;

		if (sessionId === authContext.id) {
			return APIResponse.badRequest(c, "Use logout to end your own session");
		}

		const session = DB.instance()
			.select()
			.from(DB.Tables.sessions)
			.where(eq(DB.Tables.sessions.id, sessionId))
			.get();

		if (!session) {
			return APIResponse.notFound(c, "Session not found");
		}

		await SessionHandler.inValidateSession(sessionId);
		await Audit.log(authContext.user_sub, "session.revoke", null, session.user_sub);

		return APIResponse.successNoData(c, "Session revoked successfully");
	},
);
