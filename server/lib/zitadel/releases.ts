/**
 * ZitadelReleases — the latest published Zitadel release (GitHub), cached in `RuntimeMetadata`
 * and refreshed by the cron job, compared against the versions the instances report.
 */
import { RuntimeMetadata } from "../api/utils/metadata";
import type { HostData } from "../api/utils/shared-models/hostData";
import { AppConstants } from "../utils/constants";
import { Logger } from "../utils/logger";

const LATEST_RELEASE_URL = "https://api.github.com/repos/zitadel/zitadel/releases/latest";

export class ZitadelReleases {
	static async getStatus(): Promise<HostData.ZitadelReleaseStatus> {
		return RuntimeMetadata.getZitadelRelease();
	}

	static async check(): Promise<HostData.ZitadelReleaseStatus> {
		let status: HostData.ZitadelReleaseStatus;
		try {
			const res = await fetch(LATEST_RELEASE_URL, {
				headers: {
					Accept: "application/vnd.github+json",
					"User-Agent": AppConstants.APP_NAME,
				},
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) {
				throw new Error(`GitHub answered HTTP ${res.status}`);
			}

			const release = (await res.json()) as {
				tag_name?: string;
				published_at?: string;
				html_url?: string;
			};
			status = {
				latestVersion: release.tag_name ?? null,
				latestPublishedAt: release.published_at ?? null,
				latestUrl: release.html_url ?? null,
				checkedAt: Date.now(),
				error: null,
			};
		} catch (err) {
			Logger.warn("Zitadel release check failed:", err);
			// keep the last known release, record the failure
			status = {
				...(await RuntimeMetadata.getZitadelRelease()),
				checkedAt: Date.now(),
				error: err instanceof Error ? err.message : String(err),
			};
		}

		await RuntimeMetadata.setZitadelRelease(status);
		return status;
	}

	/** Compare `vX.Y.Z` versions numerically (pre-release suffixes ignored); <0 when a < b. */
	static compareVersions(a: string, b: string): number {
		const parse = (version: string) =>
			version
				.replace(/^v/i, "")
				.split(/[-+]/)[0]
				?.split(".")
				.map((part) => Number.parseInt(part, 10) || 0) ?? [];

		const left = parse(a);
		const right = parse(b);
		for (let i = 0; i < Math.max(left.length, right.length); i++) {
			const diff = (left[i] ?? 0) - (right[i] ?? 0);
			if (diff !== 0) return diff;
		}
		return 0;
	}
}
