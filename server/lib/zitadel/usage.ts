/**
 * ZitadelUsage — org and user counts of every instance, for the cross-instance statistics.
 *
 * One Admin-API and one v2-user-API call per instance (instance-scoped, see ZitadelClient), so
 * results are cached for {@link CACHE_TTL_MS}. An instance that cannot be queried (not running,
 * no domain, missing IAM_OWNER membership) reports `null` counts plus the error.
 */
import { Logger } from "../utils/logger";
import { ZitadelApiError, ZitadelClient } from "./client";
import type { ZitadelInstance } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = 4;

export class ZitadelUsage {
	protected static cache: { fetchedAt: number; items: ZitadelUsage.InstanceUsage[] } | null = null;

	static async getAll(
		refresh = false,
	): Promise<{ fetchedAt: number; cached: boolean; items: ZitadelUsage.InstanceUsage[] }> {
		const cache = ZitadelUsage.cache;
		if (!refresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
			return { ...cache, cached: true };
		}

		const instances = await ZitadelClient.listInstances();
		const items: ZitadelUsage.InstanceUsage[] = [];

		for (let i = 0; i < instances.length; i += CONCURRENCY) {
			const batch = instances.slice(i, i + CONCURRENCY);
			items.push(...(await Promise.all(batch.map((instance) => ZitadelUsage.forInstance(instance)))));
		}

		ZitadelUsage.cache = { fetchedAt: Date.now(), items };
		return { ...ZitadelUsage.cache, cached: false };
	}

	protected static async forInstance(
		instance: ZitadelInstance,
	): Promise<ZitadelUsage.InstanceUsage> {
		const base = { instanceId: instance.id, name: instance.name, state: instance.state };
		const host = instance.domains?.find((d) => d.primary)?.domain ?? instance.domains?.[0]?.domain;
		if (!host) {
			return { ...base, orgs: null, users: null, error: "Instance has no domain" };
		}

		try {
			const [orgs, users] = await Promise.all([
				ZitadelClient.countOrgs(host),
				ZitadelClient.countUsers(host),
			]);
			return { ...base, orgs, users, error: null };
		} catch (err) {
			Logger.debug(`Usage counts for instance ${instance.id} failed:`, err);
			const error =
				err instanceof ZitadelApiError && err.status === 403
					? "Forbidden — the system user needs IAM_OWNER via a System membership"
					: err instanceof Error
						? err.message
						: String(err);
			return { ...base, orgs: null, users: null, error };
		}
	}
}

export namespace ZitadelUsage {
	export interface InstanceUsage {
		instanceId: string;
		name: string;
		state: string;
		orgs: number | null;
		users: number | null;
		error: string | null;
	}
}
