/**
 * ZitadelClient — typed wrapper over the Zitadel v1 System API (REST gateway).
 *
 * All endpoints live under `${LAVIAC_ZITADEL_SYSTEM_API_URL}/system/v1/...` and are authenticated
 * with the system-user JWT (see ./jwt.ts). This covers the cross-instance control the
 * regular Zitadel admin console does NOT expose: instance CRUD, custom domains, limits.
 *
 * The instance-scoped calls (Admin API, v2 user API, asset upload) reuse the same JWT and pick
 * the target instance with the `x-zitadel-instance-host` header (Zitadel's default
 * `InstanceHostHeaders`). They need the system user to hold `IAM_OWNER` through a `System`
 * membership in `SystemAPIUsers`; without it Zitadel answers 403.
 *
 * Reference: https://zitadel.com/docs/reference/api/system
 */
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";
import { ZitadelSystemJwt } from "./jwt";
import type {
	ZitadelCreateInstanceRequest,
	ZitadelCreateInstanceResponse,
	ZitadelDeleteInstanceResponse,
	ZitadelDomain,
	ZitadelExistsDomainResponse,
	ZitadelGetInstanceResponse,
	ZitadelGetLabelPolicyResponse,
	ZitadelInstance,
	ZitadelInstanceSortingColumn,
	ZitadelLabelPolicy,
	ZitadelListDomainsResponse,
	ZitadelListInstancesResponse,
	ZitadelListResponse,
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
}

export interface ZitadelHealth {
	reachable: boolean;
	statusCode: number | null;
	latencyMs: number | null;
	error: string | null;
}

export class ZitadelClient {
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
