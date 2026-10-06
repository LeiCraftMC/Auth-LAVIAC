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
			await DB.instance().insert(DB.Tables.metadata).values({
				key: key,
				data: defaultData,
			});
			return defaultData;
		}

		return this.schemas[key].parse(record.data) as z.infer<(typeof this.schemas)[T]>;
	}

	protected static async setMetadata<T extends keyof typeof this.schemas>(
		key: T,
		data: z.infer<(typeof this.schemas)[T]>,
	): Promise<void> {
		await DB.instance()
			.update(DB.Tables.metadata)
			.set({
				data: data,
			})
			.where(eq(DB.Tables.metadata.key, key));
	}

	// --- Typed accessors -------------------------------------------------------

	static async getOSUpdates() {
		return this.getMetadata("osUpdates", true);
	}

	static async setOSUpdates(data: HostData.OSUpdateStatus) {
		// setMetadata only updates — make sure the row exists first.
		await this.getMetadata("osUpdates", true);
		await this.setMetadata("osUpdates", data);
	}

	static async getZitadelRelease() {
		return this.getMetadata("zitadelRelease", true);
	}

	static async setZitadelRelease(data: HostData.ZitadelReleaseStatus) {
		await this.getMetadata("zitadelRelease", true);
		await this.setMetadata("zitadelRelease", data);
	}
}
