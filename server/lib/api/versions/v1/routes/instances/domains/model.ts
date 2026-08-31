import { z } from "zod";
import { InstanceDomain } from "../model";

/**
 * InstanceDomainsModel — schemas for the per-instance domains sub-router
 * (mounted at /instances/:instanceId/domains).
 */
export namespace InstanceDomainsModel {
	export namespace List {
		export const Response = z.array(InstanceDomain);
		export type Response = z.infer<typeof Response>;
	}

	export namespace Add {
		export const Body = z.object({ domain: z.string().min(1) });
		export type Body = z.infer<typeof Body>;
	}

	export namespace SetPrimary {
		export const Body = z.object({ domain: z.string().min(1) });
		export type Body = z.infer<typeof Body>;
	}
}