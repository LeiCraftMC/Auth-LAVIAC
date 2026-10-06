import { z } from "zod";
import { HostData } from "../../../../../utils/shared-models/hostData";

export namespace AdminUpdatesModel.Get {
	export const Response = z.object({
		os: HostData.OSUpdateStatus,
		zitadel: HostData.ZitadelReleaseStatus.extend({
			/** Versions reported by the instances, most common first. */
			instanceVersions: z.array(z.object({ version: z.string(), count: z.number() })),
			/** Any instance reports a version older than the latest release; `null` if unknown. */
			updateAvailable: z.boolean().nullable(),
		}),
	});
	export type Response = z.infer<typeof Response>;
}
