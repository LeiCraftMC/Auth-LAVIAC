import { APIResponse } from "../../../utils/api-response";
import { AuthHandler } from "../../../utils/auth-handler";

export const authMiddlewareV1 = createMiddleware(async (c, next) => {

	const ctx = AuthHandler.getAuthContext(c);
	if (ctx.type !== "session" || !ctx.isAdmin) {
		return APIResponse.forbidden(c, "Admin access required");
	}

	await next();

};
