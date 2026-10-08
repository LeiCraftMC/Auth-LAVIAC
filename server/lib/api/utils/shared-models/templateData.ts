import { z } from "zod";
import { InstanceTemplates } from "../../../zitadel/templates";

/**
 * TemplateData — the instance templates (server/lib/zitadel/templates.ts) as served by the API.
 * Shared by the instance-templates router, instance creation and the instance template router.
 */
export namespace TemplateData {
	export const Id = z.enum(InstanceTemplates.IDS);
	export type Id = z.infer<typeof Id>;

	const hostname = z
		.string()
		.trim()
		.toLowerCase()
		.max(200)
		.regex(
			/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
			"Must be a domain name like users.example.com",
		);

	export const Options = z.object({
		homeOrgName: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.refine(
				(name) => name.toUpperCase() !== InstanceTemplates.SYSTEM_ORG_NAME,
				`"${InstanceTemplates.SYSTEM_ORG_NAME}" is reserved for the first org`,
			)
			.optional(),
		homeOrgDomain: hostname.optional(),
		allowOrgRegistration: z.boolean().optional(),
	});
	export type Options = z.infer<typeof Options>;

	export const SettingRow = z.object({
		label: z.string(),
		value: z.string(),
		/** `baseline`: same in every template; `option`: chosen at creation. */
		source: z.enum(["baseline", "template", "option"]),
	});
	export type SettingRow = z.infer<typeof SettingRow>;

	export const SettingSection = z.object({
		id: z.string(),
		title: z.string(),
		description: z.string(),
		rows: z.array(SettingRow),
	});
	export type SettingSection = z.infer<typeof SettingSection>;

	export const Template = z.object({
		id: Id,
		name: z.string(),
		summary: z.string(),
		icon: z.string(),
		homeOrg: z
			.object({
				kind: z.enum(["company", "public", "catch-all"]),
				label: z.string(),
				description: z.string(),
				placeholder: z.string(),
			})
			.nullable(),
		asksOrgRegistration: z.boolean(),
	});
	export type Template = z.infer<typeof Template>;
}
