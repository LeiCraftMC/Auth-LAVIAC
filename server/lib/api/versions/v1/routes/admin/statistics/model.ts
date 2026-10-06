import { z } from "zod";

export namespace AdminStatisticsModel {
	export const StateCount = z.object({ state: z.string(), count: z.number() });
	export const MonthCount = z.object({ month: z.string(), count: z.number() });
	export const VersionCount = z.object({ version: z.string(), count: z.number() });
	export const DayCount = z.object({ day: z.string(), count: z.number() });
	export const ActionCount = z.object({ action: z.string(), count: z.number() });
}

export namespace AdminStatisticsModel.Get {
	export const Response = z.object({
		/** `null` when the Zitadel System API could not be queried — see `zitadelError`. */
		instances: z
			.object({
				total: z.number(),
				byState: z.array(AdminStatisticsModel.StateCount),
				/** Instances created per month over the last 12 months (`YYYY-MM`, oldest first). */
				createdPerMonth: z.array(AdminStatisticsModel.MonthCount),
				versions: z.array(AdminStatisticsModel.VersionCount),
				newest: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						state: z.string(),
						createdAt: z.string().nullable(),
					}),
				),
			})
			.nullable(),
		domains: z
			.object({
				total: z.number(),
				custom: z.number(),
				generated: z.number(),
				instancesWithCustomDomain: z.number(),
			})
			.nullable(),
		zitadelError: z.string().nullable(),
		audit: z.object({
			total: z.number(),
			/** Audit events per UTC day over the last 30 days (`YYYY-MM-DD`, oldest first). */
			perDay: z.array(AdminStatisticsModel.DayCount),
			topActions: z.array(AdminStatisticsModel.ActionCount),
		}),
		sessions: z.object({
			active: z.number(),
		}),
		tasks: z.object({
			pending: z.number(),
			running: z.number(),
			failed: z.number(),
			completed: z.number(),
		}),
		generatedAt: z.number(),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace AdminStatisticsModel.Usage {
	export const Query = z.object({
		/** Bypass the 5-minute cache. */
		refresh: z.enum(["true", "false"]).optional(),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = z.object({
		fetchedAt: z.number(),
		cached: z.boolean(),
		totals: z.object({
			orgs: z.number(),
			users: z.number(),
			/** Instances whose counts could not be read. */
			unavailable: z.number(),
		}),
		items: z.array(
			z.object({
				instanceId: z.string(),
				name: z.string(),
				state: z.string(),
				orgs: z.number().nullable(),
				users: z.number().nullable(),
				error: z.string().nullable(),
			}),
		),
	});
	export type Response = z.infer<typeof Response>;
}
