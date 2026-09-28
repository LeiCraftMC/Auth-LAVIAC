import { z } from "zod";
import { UserAccountSettings } from "../../../../utils/shared-models/accountData";

export namespace AuthModel {
	export namespace Me {
		/** Current admin user, returned by GET /auth/me. */
		export const Response = z.object({
			sub: z.string(),
			email: z.string().nullable(),
			name: z.string().nullable(),
			role: UserAccountSettings.Role,
			login_method: UserAccountSettings.LoginMethod,
		});
		export type Response = z.infer<typeof Response>;
	}

	/** POST /auth/login — static fallback login (env-configured admin account). */
	export namespace Login {
		export const Body = z.object({
			username: z.string().min(1),
			password: z.string().min(1),
		});
		export type Body = z.infer<typeof Body>;

		export const Response = z.object({
			token: z.string(),
			expires_at: z.number(),
		});
		export type Response = z.infer<typeof Response>;
	}

	/** GET /auth/methods — which login methods are configured (login-page discovery). */
	export namespace Methods {
		export const Response = z.object({
			oidc: z.boolean(),
			static: z.boolean(),
		});
		export type Response = z.infer<typeof Response>;
	}
}
