import { z } from "zod";

/**
 * InstanceData — the LAVIAC-facing shape of a Zitadel virtual instance and its domains.
 * Shared by the instance route models and the Zitadel → API mappers (./../zitadel.ts).
 */
export namespace InstanceData {
	export const Domain = z.object({
		domain: z.string(),
		primary: z.boolean().optional(),
		generated: z.boolean().optional(),
	});
	export type Domain = z.infer<typeof Domain>;

	export const Instance = z.object({
		id: z.string(),
		name: z.string(),
		state: z.string(),
		version: z.string().optional(),
		createdAt: z.string().optional(),
		changedAt: z.string().optional(),
		domains: z.array(Domain).optional(),
	});
	export type Instance = z.infer<typeof Instance>;
}
