import { z } from "zod";
import { InstanceData } from "../../../../../utils/shared-models/instanceData";

export namespace InstanceDomainsModel.GetAll {
	export const Response = z.array(InstanceData.Domain);
	export type Response = z.infer<typeof Response>;
}

export namespace InstanceDomainsModel.Add {
	export const Body = z.object({ domain: z.string().min(1).max(253) });
	export type Body = z.infer<typeof Body>;
}

export namespace InstanceDomainsModel.SetPrimary {
	export const Body = z.object({ domain: z.string().min(1).max(253) });
	export type Body = z.infer<typeof Body>;
}

export namespace InstanceDomainsModel.Domain {
	export const Params = z.object({
		instanceId: z.string().min(1).max(64),
		domain: z.string().min(1).max(253),
	});
	export type Params = z.infer<typeof Params>;
}
