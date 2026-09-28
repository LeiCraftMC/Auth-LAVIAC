/** LAVIAC frontend types — mirror the backend v1 route models (envelope `data`). */

import type {
	GetInstancesByIdResponses,
	GetInstancesByInstanceIdDomainsResponses,
	PostInstancesData,
	PostInstancesResponses,
} from "~/api-client";

/** The signed-in admin, returned by GET /auth/me. */
export type UserInfo = {
	sub: string;
	email: string | null;
	name: string | null;
	role: "admin" | "member";
	login_method: "oidc" | "static";
};

export type InstanceDomain = GetInstancesByInstanceIdDomainsResponses[200]["data"];

export type Instance = GetInstancesByIdResponses[200]["data"];

export type CreateInstanceBody = PostInstancesData["body"];

export type CreateInstanceResult = PostInstancesResponses[201]["data"];

export function primaryDomain(instance: Instance): string | undefined {
	return instance.domains?.find((d) => d.primary)?.domain ?? instance.domains?.[0]?.domain;
}
