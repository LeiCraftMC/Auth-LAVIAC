import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../../../../db";
import { ApiHelperModels } from "../../../../../utils/shared-models/api-helper-models";

export namespace AdminAuditModel {
	export const Entry = createSelectSchema(DB.Tables.auditLog);
	export type Entry = z.infer<typeof Entry>;
}

export namespace AdminAuditModel.GetAll {
	// The dashboard filters and pages client-side, so it loads a larger window at once.
	export const Query = ApiHelperModels.ListAll.QueryWithSearch.extend({
		limit: z.coerce.number().int().min(1).max(1000).default(500),
		action: z.string().min(1).max(64).optional(),
		instanceId: z.string().min(1).max(64).optional(),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = z.object({
		/** Matching entries in total (before limit/offset). */
		total: z.number(),
		items: z.array(AdminAuditModel.Entry),
	});
	export type Response = z.infer<typeof Response>;
}
