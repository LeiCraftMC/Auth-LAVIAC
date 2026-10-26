import { z } from "zod";

export namespace HooksModel.Claims {
	export const Params = z.object({
		// Zitadel ids are numeric strings.
		instanceId: z.string().regex(/^\d{1,32}$/),
	});
	export type Params = z.infer<typeof Params>;
}
