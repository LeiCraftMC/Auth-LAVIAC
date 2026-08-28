import { z } from "zod";

export namespace AuthModel {
	/** Current admin user, returned by GET /auth/me. */
	export const Me = z.object({
		sub: z.string(),
		email: z.string().nullable(),
		name: z.string().nullable(),
		isAdmin: z.boolean(),
	});
	export type Me = z.infer<typeof Me>;
}
