import type {
	GetAdminAuditResponses,
	GetAdminHostMetricsResponses,
	GetAdminHostResponses,
	GetAdminSessionsResponses,
	GetAdminStatisticsResponses,
	GetAdminStatisticsUsageResponses,
	GetAdminTasksByTaskIdResponses,
	GetAdminTasksResponses,
	GetAdminUpdatesResponses,
	GetAuthSessionResponses,
	GetInstancesByInstanceIdBrandingResponses,
	GetInstancesByInstanceIdDomainsResponses,
	GetInstancesByInstanceIdResponses,
	GetInstancesByInstanceIdTemplateResponses,
	GetInstancesResponses,
	GetInstanceTemplatesResponses,
	PostInstancesData,
	PostInstancesResponses,
} from "~/api-client";

export namespace UtilityTypes {
	export type SomePartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;
}

/** The signed-in admin — the current session (`GET /auth/session`); LAVIAC has no users table. */
export type UserInfo = GetAuthSessionResponses["200"]["data"];

export type Instance = GetInstancesByInstanceIdResponses["200"]["data"];
export type InstanceListItem = GetInstancesResponses["200"]["data"][number];
export type InstanceDomain = GetInstancesByInstanceIdDomainsResponses["200"]["data"][number];
export type NewInstance = NonNullable<PostInstancesData["body"]>;
export type CreatedInstance = PostInstancesResponses["201"]["data"];
export type InstanceBranding = GetInstancesByInstanceIdBrandingResponses["200"]["data"];
export type LabelPolicy = InstanceBranding["defaults"];
export type InstanceTemplateSetup = GetInstancesByInstanceIdTemplateResponses["200"]["data"];

export type InstanceTemplates = GetInstanceTemplatesResponses["200"]["data"];
export type InstanceTemplate = InstanceTemplates["templates"][number];
export type TemplateId = InstanceTemplate["id"];
export type TemplateSettingSection = InstanceTemplate["sections"][number];

export type Statistics = GetAdminStatisticsResponses["200"]["data"];
export type InstanceUsage = GetAdminStatisticsUsageResponses["200"]["data"];

export type HostStatus = GetAdminHostResponses["200"]["data"];
export type HostMetrics = GetAdminHostMetricsResponses["200"]["data"];
export type HostMetricsRange = HostMetrics["range"];

export type UpdateStatus = GetAdminUpdatesResponses["200"]["data"];
export type OSUpdatePackage = UpdateStatus["os"]["packages"][number];

export type AuditEntry = GetAdminAuditResponses["200"]["data"]["items"][number];

export type Task = GetAdminTasksResponses["200"]["data"][number];
export type TaskDetail = GetAdminTasksByTaskIdResponses["200"]["data"];

export type AdminSession = GetAdminSessionsResponses["200"]["data"][number];
