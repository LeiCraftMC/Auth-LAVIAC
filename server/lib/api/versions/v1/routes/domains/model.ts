import { z } from "zod";

export namespace DomainsModel.Exists {
	export const Params = z.object({
		domain: z.string().min(1).max(253),
	});
	export type Params = z.infer<typeof Params>;

	export const Response = z.object({ exists: z.boolean() });
	export type Response = z.infer<typeof Response>;
}
