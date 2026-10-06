import { z } from "zod";

export namespace InstanceLimitsModel.Set {
	export const Body = z.object({
		/** A protobuf duration, e.g. `720h`. */
		auditLogRetention: z.string().optional(),
		block: z.boolean().nullable().optional(),
	});
	export type Body = z.infer<typeof Body>;
}
