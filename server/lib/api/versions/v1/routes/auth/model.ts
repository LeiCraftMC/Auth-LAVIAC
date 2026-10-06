import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../../../db";

export namespace AuthModel.Login {
	export const Body = z.object({
		username: z.string(),
		password: z.string(),
	});
	export type Body = z.infer<typeof Body>;

	export const Response = createSelectSchema(DB.Tables.sessions)
		.omit({
			id: true,
			hashed_token: true,
		})
		.extend({
			token: z.string(),
		});
	export type Response = z.infer<typeof Response>;
}

// LAVIAC has no users table — the admin's identity (Zitadel `sub`, name, email, role, login
// method) is cached on the session row, so the session is also the "current user".
export namespace AuthModel.Session {
	export const Response = createSelectSchema(DB.Tables.sessions).omit({
		id: true,
		hashed_token: true,
	});
	export type Response = z.infer<typeof Response>;
}

/** GET /auth/methods — which login methods are configured (login-page discovery). */
export namespace AuthModel.Methods {
	export const Response = z.object({
		oidc: z.boolean(),
		static: z.boolean(),
	});
	export type Response = z.infer<typeof Response>;
}
