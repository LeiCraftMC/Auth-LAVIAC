import { z } from "zod";

/** A custom domain attached to an instance. */
export const InstanceDomain = z.object({
	domain: z.string(),
	primary: z.boolean().optional(),
	generated: z.boolean().optional(),
});
export type InstanceDomain = z.infer<typeof InstanceDomain>;

/** A Zitadel virtual instance, in the LAVIAC-facing shape. */
export const Instance = z.object({
	id: z.string(),
	name: z.string(),
	state: z.string(),
	version: z.string().optional(),
	createdAt: z.string().optional(),
	changedAt: z.string().optional(),
	domains: z.array(InstanceDomain).optional(),
});
export type Instance = z.infer<typeof Instance>;

export namespace InstancesModel {
	export namespace List {
		export const Response = z.array(Instance);
		export type Response = z.infer<typeof Response>;
	}

	export namespace Get {
		export const Response = Instance;
		export type Response = z.infer<typeof Response>;
	}

	export namespace Create {
		export const HumanOwner = z.object({
			userName: z.string().min(1),
			email: z.object({
				email: z.string().email(),
				isEmailVerified: z.boolean().optional(),
			}),
			profile: z.object({
				firstName: z.string().min(1),
				lastName: z.string().min(1),
				preferredLanguage: z.string().optional(),
			}),
			password: z.object({
				password: z.string().min(1),
				passwordChangeRequired: z.boolean().optional(),
			}),
		});
		export type HumanOwner = z.infer<typeof HumanOwner>;

		export const MachineOwner = z.object({
			userName: z.string().min(1),
			name: z.string().min(1),
			personalAccessToken: z
				.object({
					expirationDate: z.string().optional(),
				})
				.optional(),
			machineKey: z
				.object({
					type: z.string(),
					expirationDate: z.string().optional(),
				})
				.optional(),
		});
		export type MachineOwner = z.infer<typeof MachineOwner>;

		export const Body = z
			.object({
				instanceName: z.string().min(1),
				firstOrgName: z.string().optional(),
				customDomain: z.string().optional(),
				defaultLanguage: z.string().optional(),
				human: HumanOwner.optional(),
				machine: MachineOwner.optional(),
			})
			.refine(
				(data) => (data.human ? 1 : 0) + (data.machine ? 1 : 0) === 1,
				"Exactly one of `human` or `machine` must be set (the instance owner).",
			);
		export type Body = z.infer<typeof Body>;

		export const Response = z.object({
			instanceId: z.string(),
			pat: z.string().optional(),
			machineKey: z.string().optional(),
		});
		export type Response = z.infer<typeof Response>;
	}

	export namespace Update {
		export const Body = z.object({
			instanceName: z.string().min(1),
		});
		export type Body = z.infer<typeof Body>;
	}
}

// Per-instance domain and limits schemas live in their own route folders:
//   instances/domains/model.ts → InstanceDomainsModel
//   instances/limits/model.ts  → InstanceLimitsModel
