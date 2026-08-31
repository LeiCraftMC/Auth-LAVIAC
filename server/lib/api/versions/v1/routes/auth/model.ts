import { z } from "zod";

export namespace AuthModel {
	export namespace Me {
		/** Current admin user, returned by GET /auth/me. */
		export const Response = z.object({
			sub: z.string(),
			email: z.string().nullable(),
			name: z.string().nullable(),
			isAdmin: z.boolean(),
		});
		export type Response = z.infer<typeof Response>;
	}
}