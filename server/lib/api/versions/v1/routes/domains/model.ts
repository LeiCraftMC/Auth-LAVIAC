import { z } from "zod";

/** Cross-instance domain models (mounted at /domains). */
export namespace DomainsModel {
	export namespace Exists {
		export const Response = z.object({ exists: z.boolean() });
		export type Response = z.infer<typeof Response>;
	}
}