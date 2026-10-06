import { z } from "zod";
import { TaskData } from "../../../../../utils/shared-models/taskData";

export namespace InstanceBrandingModel {
	export const ThemeMode = z.enum([
		"THEME_MODE_UNSPECIFIED",
		"THEME_MODE_AUTO",
		"THEME_MODE_DARK",
		"THEME_MODE_LIGHT",
	]);

	export const LabelPolicy = z.object({
		primaryColor: z.string().optional(),
		backgroundColor: z.string().optional(),
		warnColor: z.string().optional(),
		fontColor: z.string().optional(),
		primaryColorDark: z.string().optional(),
		backgroundColorDark: z.string().optional(),
		warnColorDark: z.string().optional(),
		fontColorDark: z.string().optional(),
		hideLoginNameSuffix: z.boolean().optional(),
		disableWatermark: z.boolean().optional(),
		themeMode: ThemeMode.optional(),
		fontUrl: z.string().optional(),
		isDefault: z.boolean().optional(),
	});
	export type LabelPolicy = z.infer<typeof LabelPolicy>;
}

export namespace InstanceBrandingModel.Get {
	export const Response = z.object({
		instanceHost: z.string().nullable(),
		/** The instance's active label policy; `null` when it could not be read (see `error`). */
		policy: InstanceBrandingModel.LabelPolicy.nullable(),
		error: z.string().nullable(),
		/** The LAVIAC default branding applied to new instances. */
		defaults: InstanceBrandingModel.LabelPolicy,
		defaultFont: z.object({
			fileName: z.string(),
			available: z.boolean(),
		}),
		/** The latest `applyDefaultBranding` task of this instance. */
		lastTask: TaskData.Task.nullable(),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace InstanceBrandingModel.ApplyDefaults {
	export const Response = z.object({
		taskId: z.number(),
	});
	export type Response = z.infer<typeof Response>;
}
