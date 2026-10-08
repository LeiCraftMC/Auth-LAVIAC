import { z } from "zod";
import { TaskData } from "../../../../../utils/shared-models/taskData";
import { TemplateData } from "../../../../../utils/shared-models/templateData";

export namespace InstanceTemplateModel.Get {
	export const Response = z.object({
		/** `null` for instances created before templates. */
		setup: z
			.object({
				template: TemplateData.Template,
				options: TemplateData.Options,
				systemOrgId: z.string().nullable(),
				homeOrgId: z.string().nullable(),
				createdAt: z.number(),
				createdBySub: z.string().nullable(),
				/** The settings the template applied, with the options chosen at creation. */
				sections: z.array(TemplateData.SettingSection),
			})
			.nullable(),
		/** The instance's current default org, read live from Zitadel; `null` on error. */
		defaultOrg: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
		error: z.string().nullable(),
		/** The latest `provisionInstance` task of this instance. */
		lastTask: TaskData.Task.nullable(),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace InstanceTemplateModel.Apply {
	export const Response = z.object({
		taskId: z.number(),
	});
	export type Response = z.infer<typeof Response>;
}
