import { eq } from "drizzle-orm";
import { z } from "zod";
import { DB } from "../../db/index";
import { HostData } from "./shared-models/hostData";

export class RuntimeMetadata {
	protected static readonly schemas = {
		osUpdates: HostData.OSUpdateStatus.default({
			supported: false,
			reason: null,
			checkedAt: null,
			listsUpdatedAt: null,
			rebootRequired: false,
			rebootPackages: [],
			packages: [],
			error: null,
		}),
		zitadelRelease: HostData.ZitadelReleaseStatus.default({
			latestVersion: null,
			latestPublishedAt: null,
			latestUrl: null,
			checkedAt: null,
			error: null,
		}),
	} as const;

	protected static async getMetadata<T extends keyof typeof this.schemas>(
		key: T,
		createIfNotFound = false,
	): Promise<z.infer<(typeof this.schemas)[T]>> {
		const record = await DB.instance()
			.select()
			.from(DB.Tables.metadata)
			.where(eq(DB.Tables.metadata.key, key))
			.get();

		if (!record) {
			if (!createIfNotFound) {
				throw new Error(`Metadata with key '${key}' not found`);
			}

			const defaultData = this.schemas[key].parse(undefined) as z.infer<(typeof this.schemas)[T]>;
			// A concurrent first caller may have inserted the row meanwhile — keep theirs.
			await DB.instance()
				.insert(DB.Tables.metadata)
				.values({
					key: key,
					data: defaultData,
				})
				.onConflictDoNothing();
			return defaultData;
		}

		return this.schemas[key].parse(record.data) as z.infer<(typeof this.schemas)[T]>;
	}

	protected static async setMetadata<T extends keyof typeof this.schemas>(
		key: T,
		data: z.infer<(typeof this.schemas)[T]>,
	): Promise<void> {
		// LAVIAC: an upsert, so a value can be written without reading (and creating) it first.
		await DB.instance()
			.insert(DB.Tables.metadata)
			.values({ key: key, data: data })
			.onConflictDoUpdate({ target: DB.Tables.metadata.key, set: { data: data } });
	}

	// --- Typed accessors -------------------------------------------------------

	static async getOSUpdates() {
		return this.getMetadata("osUpdates", true);
	}

	static async setOSUpdates(data: HostData.OSUpdateStatus) {
		await this.setMetadata("osUpdates", data);
	}

	static async getZitadelRelease() {
		return this.getMetadata("zitadelRelease", true);
	}

	static async setZitadelRelease(data: HostData.ZitadelReleaseStatus) {
		await this.setMetadata("zitadelRelease", data);
	}
}
