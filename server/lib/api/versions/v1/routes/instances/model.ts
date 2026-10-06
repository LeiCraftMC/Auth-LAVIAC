import { z } from "zod";
import { InstanceData } from "../../../../utils/shared-models/instanceData";

export namespace InstancesModel {
	export const Instance = InstanceData.Instance;
	export type Instance = InstanceData.Instance;
}

export namespace InstancesModel.GetAll {
	export const Response = z.array(InstancesModel.Instance);
	export type Response = z.infer<typeof Response>;
}

export namespace InstancesModel.InstanceId {
	export const Params = z.object({
		instanceId: z.string().min(1).max(64),
	});
	export type Params = z.infer<typeof Params>;
}

export namespace InstancesModel.Get {
	export const Response = InstancesModel.Instance;
	export type Response = z.infer<typeof Response>;
}

export namespace InstancesModel.Create {
	export const HumanOwner = z.object({
		userName: z.string().min(1),
		email: z.object({
			email: z.email(),
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
		/** The queued `applyDefaultBranding` task, `null` when default branding is disabled. */
		brandingTaskId: z.number().nullable(),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace InstancesModel.Update {
	export const Body = z.object({
		instanceName: z.string().min(1),
	});
	export type Body = z.infer<typeof Body>;

	export const Response = InstancesModel.Instance;
	export type Response = z.infer<typeof Response>;
}
