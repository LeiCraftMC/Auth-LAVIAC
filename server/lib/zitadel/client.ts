/**
 * ZitadelClient — typed wrapper over the Zitadel v1 System API (REST gateway).
 *
 * All endpoints live under `${LAVIAC_ZITADEL_SYSTEM_API_URL}/system/v1/...` and are authenticated
 * with the system-user JWT (see ./jwt.ts). This covers the cross-instance control the
 * regular Zitadel admin console does NOT expose: instance CRUD, custom domains, limits.
 *
 * The instance-scoped calls (Admin and Management API, v2 user and organization API, asset
 * upload) reuse the same JWT and pick the target instance with the `x-zitadel-instance-host`
 * header (Zitadel's default `InstanceHostHeaders`); Management API calls pick the org with
 * `x-zitadel-orgid`. They need the system user to hold `IAM_OWNER` through a `System`
 * membership in `SystemAPIUsers`; without it Zitadel answers 403.
 *
 * Reference: https://zitadel.com/docs/reference/api/system
 */
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";
import { ZitadelSystemJwt } from "./jwt";
import type {
	ZitadelAddOrganizationResponse,
	ZitadelCreateInstanceRequest,
	ZitadelCreateInstanceResponse,
	ZitadelCustomLoginPolicy,
	ZitadelDeleteInstanceResponse,
	ZitadelDomain,
	ZitadelDomainPolicy,
	ZitadelExistsDomainResponse,
	ZitadelGetDefaultOrgResponse,
	ZitadelGetInstanceResponse,
	ZitadelGetLabelPolicyResponse,
	ZitadelInstance,
	ZitadelInstanceSortingColumn,
	ZitadelLabelPolicy,
	ZitadelListDomainsResponse,
	ZitadelListInstancesResponse,
	ZitadelListOrganizationsResponse,
	ZitadelListResponse,
	ZitadelLockoutPolicy,
	ZitadelLoginPolicy,
	ZitadelOIDCSettings,
	ZitadelOrganization,
	ZitadelPasswordComplexityPolicy,
	ZitadelRestrictions,
	ZitadelSecurityPolicy,
	ZitadelSetLimitsRequest,
	ZitadelUpdateInstanceResponse,
	ZitadelUpdateLabelPolicyRequest,
} from "./types";

export class ZitadelApiError extends Error {
	readonly status: number;
	readonly details: unknown;
	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.name = "ZitadelApiError";
		this.status = status;
		this.details = details;
	}
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

// One hung call must not stall the serial task queue (see server/lib/tasks/).
const REQUEST_TIMEOUT_MS = 30_000;

interface RequestOptions {
	/** JSON body. */
	body?: unknown;
	/** Multipart body (asset uploads) — sent instead of `body`. */
	formData?: FormData;
	/** Target instance for the instance-scoped APIs (`x-zitadel-instance-host`). */
	instanceHost?: string;
	/** Target org for the Management API (`x-zitadel-orgid`). */
	orgId?: string;
}

export interface ZitadelHealth {
	reachable: boolean;
	statusCode: number | null;
	latencyMs: number | null;
	error: string | null;
}

export class ZitadelClient {
	/**
	 * The host an instance is addressed with in the instance-scoped calls
	 * (`x-zitadel-instance-host`): its primary domain, else its first one.
	 */
	static getInstanceHost(instance: { domains?: ZitadelDomain[] }) {
		return instance.domains?.find((d) => d.primary)?.domain ?? instance.domains?.[0]?.domain ?? null;
	}

	private static baseUrl(): string {
		return (ConfigHandler.getConfig()?.ZITADEL_SYSTEM_API_URL ?? "").replace(/\/$/, "");
	}

	private static async request<T>(
		method: Method,
		path: string,
		options: RequestOptions = {},
	): Promise<T> {
		const url = `${ZitadelClient.baseUrl()}${path}`;
		const token = await ZitadelSystemJwt.get();

		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
			// Zitadel localizes error messages to the instance language; the branding task matches
			// on the English "not changed" message.
			"Accept-Language": "en",
		};
		// Multipart bodies set their own boundary content type.
		if (!options.formData) {
			headers["Content-Type"] = "application/json";
		}
		if (options.instanceHost) {
			headers["x-zitadel-instance-host"] = options.instanceHost;
		}
		if (options.orgId) {
			headers["x-zitadel-orgid"] = options.orgId;
		}

		Logger.debug(
			`Zitadel ${method} ${path}${options.instanceHost ? ` (instance ${options.instanceHost})` : ""}`,
		);
		const res = await fetch(url, {
			method,
			headers,
			body:
				options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		// Some delete/reset endpoints return an empty body on success.
		const text = await res.text();
		let json: unknown = null;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch {
				// non-JSON error body (e.g. an HTML gateway page) — fall through to the
				// !res.ok branch, which synthesizes a message from method/path.
			}
		}

		if (!res.ok) {
			const message =
				json && typeof json === "object" && "message" in json
					? String((json as { message: unknown }).message)
					: `Zitadel ${method} ${path} failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`;
			throw new ZitadelApiError(res.status, message, json);
		}

		return json as T;
	}

	// --- Instances -------------------------------------------------------------

	static async listInstances(params?: {
		sortingColumn?: ZitadelInstanceSortingColumn;
	}): Promise<ZitadelInstance[]> {
		const res = await ZitadelClient.request<ZitadelListInstancesResponse>(
			"POST",
			"/system/v1/instances/_search",
			{ body: { sortingColumn: params?.sortingColumn ?? "FIELD_NAME_CREATION_DATE" } },
		);
		return res.result ?? [];
	}

	static async getInstance(instanceId: string): Promise<ZitadelInstance> {
		const res = await ZitadelClient.request<ZitadelGetInstanceResponse>(
			"GET",
			`/system/v1/instances/${instanceId}`,
		);
		if (!res.instance) {
			throw new ZitadelApiError(404, `Instance ${instanceId} not found`);
		}
		return res.instance;
	}

	static async createInstance(
		body: ZitadelCreateInstanceRequest,
	): Promise<ZitadelCreateInstanceResponse> {
		return ZitadelClient.request<ZitadelCreateInstanceResponse>(
			"POST",
			"/system/v1/instances/_create",
			{ body },
		);
	}

	static async updateInstance(
		instanceId: string,
		instanceName: string,
	): Promise<ZitadelUpdateInstanceResponse> {
		return ZitadelClient.request<ZitadelUpdateInstanceResponse>(
			"PUT",
			`/system/v1/instances/${instanceId}`,
			{ body: { instanceName } },
		);
	}

	static async deleteInstance(instanceId: string): Promise<ZitadelDeleteInstanceResponse> {
		return ZitadelClient.request<ZitadelDeleteInstanceResponse>(
			"DELETE",
			`/system/v1/instances/${instanceId}`,
		);
	}

	// --- Domains (scoped to an instance) ---------------------------------------

	static async listDomains(instanceId: string): Promise<ZitadelDomain[]> {
		const res = await ZitadelClient.request<ZitadelListDomainsResponse>(
			"POST",
			`/system/v1/instances/${instanceId}/domains/_search`,
			{ body: {} },
		);
		return res.result ?? [];
	}

	static async addDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request("POST", `/system/v1/instances/${instanceId}/domains`, {
			body: { domain },
		});
	}

	static async removeDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request(
			"DELETE",
			`/system/v1/instances/${instanceId}/domains/${encodeURIComponent(domain)}`,
		);
	}

	static async setPrimaryDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request("POST", `/system/v1/instances/${instanceId}/domains/_set_primary`, {
			body: { domain },
		});
	}

	// --- Domains (global) ------------------------------------------------------

	static async existsDomain(domain: string): Promise<boolean> {
		const res = await ZitadelClient.request<ZitadelExistsDomainResponse>(
			"POST",
			`/system/v1/domains/${encodeURIComponent(domain)}/_exists`,
		);
		return res.exists === true;
	}

	// --- Limits ----------------------------------------------------------------

	static async setLimits(instanceId: string, body: ZitadelSetLimitsRequest): Promise<void> {
		await ZitadelClient.request("PUT", `/system/v1/instances/${instanceId}/limits`, { body });
	}

	static async resetLimits(instanceId: string): Promise<void> {
		await ZitadelClient.request("DELETE", `/system/v1/instances/${instanceId}/limits`);
	}

	// --- Branding (Admin API, instance-scoped) ---------------------------------

	/** The instance's active default label policy. */
	static async getLabelPolicy(instanceHost: string): Promise<ZitadelLabelPolicy | null> {
		const res = await ZitadelClient.request<ZitadelGetLabelPolicyResponse>(
			"GET",
			"/admin/v1/policies/label",
			{ instanceHost },
		);
		return res.policy ?? null;
	}

	/** Write the preview label policy — it goes live with {@link activateLabelPolicy}. */
	static async updateLabelPolicy(
		instanceHost: string,
		body: ZitadelUpdateLabelPolicyRequest,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/label", { instanceHost, body });
	}

	/** Upload the preview label policy's font (Assets API, multipart field `file`). */
	static async uploadLabelPolicyFont(
		instanceHost: string,
		font: Uint8Array<ArrayBuffer>,
		fileName: string,
		contentType: string,
	): Promise<void> {
		const formData = new FormData();
		formData.append("file", new Blob([font], { type: contentType }), fileName);
		await ZitadelClient.request("POST", "/assets/v1/instance/policy/label/font", {
			instanceHost,
			formData,
		});
	}

	static async activateLabelPolicy(instanceHost: string): Promise<void> {
		await ZitadelClient.request("POST", "/admin/v1/policies/label/_activate", {
			instanceHost,
			body: {},
		});
	}

	// --- Instance settings (Admin API, instance-scoped) ------------------------

	/** The instance's default login policy, inherited by every org without its own. */
	static async updateDefaultLoginPolicy(
		instanceHost: string,
		body: ZitadelLoginPolicy,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/login", { instanceHost, body });
	}

	/**
	 * The instance's default domain policy. Changing `userLoginMustBeDomain` rewrites the
	 * usernames of every org without its own domain policy.
	 */
	static async updateDefaultDomainPolicy(
		instanceHost: string,
		body: ZitadelDomainPolicy,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/domain", { instanceHost, body });
	}

	static async updateDefaultPasswordComplexityPolicy(
		instanceHost: string,
		body: ZitadelPasswordComplexityPolicy,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/password/complexity", {
			instanceHost,
			body,
		});
	}

	static async updateDefaultLockoutPolicy(
		instanceHost: string,
		body: ZitadelLockoutPolicy,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/password/lockout", {
			instanceHost,
			body,
		});
	}

	static async setSecurityPolicy(instanceHost: string, body: ZitadelSecurityPolicy): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/policies/security", { instanceHost, body });
	}

	static async updateOIDCSettings(instanceHost: string, body: ZitadelOIDCSettings): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/settings/oidc", { instanceHost, body });
	}

	static async setRestrictions(instanceHost: string, body: ZitadelRestrictions): Promise<void> {
		await ZitadelClient.request("PUT", "/admin/v1/restrictions", { instanceHost, body });
	}

	/** The org the login uses without org context; self-registered users land there. */
	static async getDefaultOrg(instanceHost: string): Promise<{ id: string; name?: string } | null> {
		const res = await ZitadelClient.request<ZitadelGetDefaultOrgResponse>(
			"GET",
			"/admin/v1/orgs/default",
			{ instanceHost },
		);
		return res.org ?? null;
	}

	static async setDefaultOrg(instanceHost: string, orgId: string): Promise<void> {
		await ZitadelClient.request("PUT", `/admin/v1/orgs/default/${encodeURIComponent(orgId)}`, {
			instanceHost,
			body: {},
		});
	}

	// --- Organizations (instance-scoped) ---------------------------------------

	/** Org names are unique within an instance. */
	static async findOrgByName(
		instanceHost: string,
		name: string,
	): Promise<ZitadelOrganization | null> {
		const res = await ZitadelClient.request<ZitadelListOrganizationsResponse>(
			"POST",
			"/v2/organizations/_search",
			{
				instanceHost,
				body: { queries: [{ nameQuery: { name, method: "TEXT_QUERY_METHOD_EQUALS" } }] },
			},
		);
		return res.result?.[0] ?? null;
	}

	/** Create an org without admins (the instance's IAM owners manage it). Returns its id. */
	static async addOrg(instanceHost: string, name: string): Promise<string> {
		const res = await ZitadelClient.request<ZitadelAddOrganizationResponse>(
			"POST",
			"/v2/organizations",
			{ instanceHost, body: { name } },
		);
		return res.organizationId;
	}

	/** Give an org its own login policy (409 when it has one already). */
	static async addOrgLoginPolicy(
		instanceHost: string,
		orgId: string,
		body: ZitadelCustomLoginPolicy,
	): Promise<void> {
		await ZitadelClient.request("POST", "/management/v1/policies/login", {
			instanceHost,
			orgId,
			body,
		});
	}

	/** Update an org's own login policy; its factors are kept. */
	static async updateOrgLoginPolicy(
		instanceHost: string,
		orgId: string,
		body: ZitadelLoginPolicy,
	): Promise<void> {
		await ZitadelClient.request("PUT", "/management/v1/policies/login", {
			instanceHost,
			orgId,
			body,
		});
	}

	/** Give an org its own domain policy (409 when it has one already). */
	static async addOrgDomainPolicy(
		instanceHost: string,
		orgId: string,
		body: ZitadelDomainPolicy,
	): Promise<void> {
		await ZitadelClient.request(
			"POST",
			`/admin/v1/orgs/${encodeURIComponent(orgId)}/policies/domain`,
			{ instanceHost, body },
		);
	}

	static async updateOrgDomainPolicy(
		instanceHost: string,
		orgId: string,
		body: ZitadelDomainPolicy,
	): Promise<void> {
		await ZitadelClient.request(
			"PUT",
			`/admin/v1/orgs/${encodeURIComponent(orgId)}/policies/domain`,
			{ instanceHost, body },
		);
	}

	/** Drop an org's own domain policy so it inherits the instance default (404 without one). */
	static async resetOrgDomainPolicy(instanceHost: string, orgId: string): Promise<void> {
		await ZitadelClient.request(
			"DELETE",
			`/admin/v1/orgs/${encodeURIComponent(orgId)}/policies/domain`,
			{ instanceHost },
		);
	}

	static async setOrgMetadata(
		instanceHost: string,
		orgId: string,
		key: string,
		value: string,
	): Promise<void> {
		await ZitadelClient.request("POST", `/management/v1/metadata/${encodeURIComponent(key)}`, {
			instanceHost,
			orgId,
			body: { value: Buffer.from(value).toString("base64") },
		});
	}

	/** Add a domain to an org (409 when it has it already); verified at once if the org's domain policy skips validation. */
	static async addOrgDomain(instanceHost: string, orgId: string, domain: string): Promise<void> {
		await ZitadelClient.request("POST", "/management/v1/orgs/me/domains", {
			instanceHost,
			orgId,
			body: { domain },
		});
	}

	static async setPrimaryOrgDomain(
		instanceHost: string,
		orgId: string,
		domain: string,
	): Promise<void> {
		await ZitadelClient.request(
			"POST",
			`/management/v1/orgs/me/domains/${encodeURIComponent(domain)}/_set_primary`,
			{ instanceHost, orgId, body: {} },
		);
	}

	// --- Usage counts (instance-scoped) ----------------------------------------

	static async countOrgs(instanceHost: string): Promise<number> {
		const res = await ZitadelClient.request<ZitadelListResponse>("POST", "/admin/v1/orgs/_search", {
			instanceHost,
			body: { query: { limit: 1 } },
		});
		return Number(res.details?.totalResult ?? 0);
	}

	static async countUsers(instanceHost: string): Promise<number> {
		const res = await ZitadelClient.request<ZitadelListResponse>("POST", "/v2/users", {
			instanceHost,
			body: { query: { limit: 1 } },
		});
		return Number(res.details?.totalResult ?? 0);
	}

	// --- Health ----------------------------------------------------------------

	/** Probe Zitadel's unauthenticated `/debug/healthz` and measure the round trip. */
	static async health(timeoutMs = 5000): Promise<ZitadelHealth> {
		const base = ZitadelClient.baseUrl();
		if (!base) {
			return {
				reachable: false,
				statusCode: null,
				latencyMs: null,
				error: "LAVIAC_ZITADEL_SYSTEM_API_URL is not set",
			};
		}

		const startedAt = performance.now();
		try {
			const res = await fetch(`${base}/debug/healthz`, {
				signal: AbortSignal.timeout(timeoutMs),
			});
			return {
				reachable: res.ok,
				statusCode: res.status,
				latencyMs: Math.round(performance.now() - startedAt),
				error: res.ok ? null : `HTTP ${res.status}`,
			};
		} catch (err) {
			return {
				reachable: false,
				statusCode: null,
				latencyMs: null,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
