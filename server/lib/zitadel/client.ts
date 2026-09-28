/**
 * ZitadelClient — typed wrapper over the Zitadel v1 System API (REST gateway).
 *
 * All endpoints live under `${LAVIAC_ZITADEL_SYSTEM_API_URL}/system/v1/...` and are authenticated
 * with the system-user JWT (see ./jwt.ts). This covers the cross-instance control the
 * regular Zitadel admin console does NOT expose: instance CRUD, custom domains, limits.
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
	ZitadelInstance,
	ZitadelInstanceSortingColumn,
	ZitadelListDomainsResponse,
	ZitadelListInstancesResponse,
	ZitadelSetLimitsRequest,
	ZitadelUpdateInstanceResponse,
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

export class ZitadelClient {
	private static baseUrl(): string {
		return (ConfigHandler.getConfig()?.ZITADEL_SYSTEM_API_URL ?? "").replace(/\/$/, "");
	}

	private static async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
		const url = `${ZitadelClient.baseUrl()}${path}`;
		const token = await ZitadelSystemJwt.get();

		Logger.debug(`Zitadel ${method} ${path}`);
		const res = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
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
					: `Zitadel ${method} ${path} failed`;
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
			{ sortingColumn: params?.sortingColumn ?? "FIELD_NAME_CREATION_DATE" },
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
			body,
		);
	}

	static async updateInstance(
		instanceId: string,
		instanceName: string,
	): Promise<ZitadelUpdateInstanceResponse> {
		return ZitadelClient.request<ZitadelUpdateInstanceResponse>(
			"PUT",
			`/system/v1/instances/${instanceId}`,
			{ instanceName },
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
			{},
		);
		return res.result ?? [];
	}

	static async addDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request("POST", `/system/v1/instances/${instanceId}/domains`, { domain });
	}

	static async removeDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request("DELETE", `/system/v1/instances/${instanceId}/domains/${domain}`);
	}

	static async setPrimaryDomain(instanceId: string, domain: string): Promise<void> {
		await ZitadelClient.request("POST", `/system/v1/instances/${instanceId}/domains/_set_primary`, {
			domain,
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
		await ZitadelClient.request("PUT", `/system/v1/instances/${instanceId}/limits`, body);
	}

	static async resetLimits(instanceId: string): Promise<void> {
		await ZitadelClient.request("DELETE", `/system/v1/instances/${instanceId}/limits`);
	}
}
