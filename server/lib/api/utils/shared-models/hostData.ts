import { z } from "zod";

/**
 * HostData — the persisted/served shapes of the host-VM tooling (server/lib/host/): the OS
 * package-update status and the Zitadel release check. Shared by `RuntimeMetadata` (which
 * caches them) and the admin route models (which serve them), so they cannot drift.
 */
export namespace HostData {
	export const OSUpdatePackage = z.object({
		name: z.string(),
		currentVersion: z.string(),
		candidateVersion: z.string(),
		/** apt suite(s) the update comes from, e.g. `bookworm-security`. */
		origin: z.string(),
		security: z.boolean(),
	});
	export type OSUpdatePackage = z.infer<typeof OSUpdatePackage>;

	export const OSUpdateStatus = z.object({
		/** `false` when the host has no apt (non-Debian/Ubuntu) — see `reason`. */
		supported: z.boolean(),
		reason: z.string().nullable(),
		checkedAt: z.number().nullable(),
		/** When the host last refreshed its package lists (`apt update`). */
		listsUpdatedAt: z.number().nullable(),
		rebootRequired: z.boolean(),
		rebootPackages: z.array(z.string()),
		packages: z.array(OSUpdatePackage),
		error: z.string().nullable(),
	});
	export type OSUpdateStatus = z.infer<typeof OSUpdateStatus>;

	export const ZitadelReleaseStatus = z.object({
		latestVersion: z.string().nullable(),
		latestPublishedAt: z.string().nullable(),
		latestUrl: z.string().nullable(),
		checkedAt: z.number().nullable(),
		error: z.string().nullable(),
	});
	export type ZitadelReleaseStatus = z.infer<typeof ZitadelReleaseStatus>;
}
