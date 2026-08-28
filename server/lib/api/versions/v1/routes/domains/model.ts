import { z } from "zod";

export namespace DomainsModel {
	export const ExistsResponse = z.object({ exists: z.boolean() });
	export type ExistsResponse = z.infer<typeof ExistsResponse>;
}
