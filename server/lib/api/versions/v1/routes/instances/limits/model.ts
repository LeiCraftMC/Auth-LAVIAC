import { z } from "zod";

/**
 * InstanceLimitsModel — schemas for the per-instance limits sub-router
 * (mounted at /instances/:instanceId/limits).
 */
export namespace InstanceLimitsModel {
	export namespace Set {
		export const Body = z.object({
			auditLogRetention: z.string().optional(),
			block: z.boolean().nullable().optional(),
		});
		export type Body = z.infer<typeof Body>;
	}
}
