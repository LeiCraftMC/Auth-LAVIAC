import { z } from "zod";
import { TemplateData } from "../../../../utils/shared-models/templateData";

export namespace InstanceTemplatesModel.GetAll {
	export const Response = z.object({
		/** Name of the first org every template creates. */
		systemOrgName: z.string(),
		templates: z.array(
			TemplateData.Template.extend({
				/** The settings the template applies; values chosen at creation are marked. */
				sections: z.array(TemplateData.SettingSection),
			}),
		),
	});
	export type Response = z.infer<typeof Response>;
}
