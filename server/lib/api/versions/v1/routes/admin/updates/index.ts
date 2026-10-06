import { Hono } from "hono";
import { OSUpdates } from "../../../../../../host/updates";
import { Audit } from "../../../../../../utils/audit";
import { Logger } from "../../../../../../utils/logger";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { ZitadelReleases } from "../../../../../../zitadel/releases";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler } from "../../../../../utils/authHandler";
import type { HostData } from "../../../../../utils/shared-models/hostData";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminUpdatesModel } from "./model";

async function buildStatus(
	os: HostData.OSUpdateStatus,
	release: HostData.ZitadelReleaseStatus,
): Promise<AdminUpdatesModel.Get.Response> {
	let instanceVersions: { version: string; count: number }[] = [];
	try {
		const counts = new Map<string, number>();
		for (const instance of await ZitadelClient.listInstances()) {
			if (instance.version) {
				counts.set(instance.version, (counts.get(instance.version) ?? 0) + 1);
			}
		}
		instanceVersions = [...counts]
			.map(([version, count]) => ({ version, count }))
			.sort((a, b) => b.count - a.count);
	} catch (err) {
		Logger.warn("Could not list instances for the update overview:", err);
	}

	const latest = release.latestVersion;
	return {
		os,
		zitadel: {
			...release,
			instanceVersions,
			updateAvailable:
				latest && instanceVersions.length > 0
					? instanceVersions.some((v) => ZitadelReleases.compareVersions(v.version, latest) < 0)
					: null,
		},
	};
}

export const router = new Hono().basePath("/updates");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get update status",
		description:
			"Pending OS package updates of the host VM (apt) and the latest Zitadel release compared with the instances' versions. Served from the cache, which the 6-hourly cron job refreshes; the first call runs the checks.",
		tags: [DOCS_TAGS.ADMIN_API.UPDATES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Update status retrieved successfully", AdminUpdatesModel.Get.Response),
		),
	}),

	async (c) => {
		let [os, release] = await Promise.all([OSUpdates.getStatus(), ZitadelReleases.getStatus()]);
		if (os.checkedAt === null) os = await OSUpdates.check();
		if (release.checkedAt === null) release = await ZitadelReleases.check();

		return APIResponse.success(
			c,
			"Update status retrieved successfully",
			await buildStatus(os, release),
		);
	},
);

router.post(
	"/_check",

	APIRouteSpec.authenticated({
		summary: "Check for updates now",
		description: "Re-run the OS package and Zitadel release checks and return the fresh status.",
		tags: [DOCS_TAGS.ADMIN_API.UPDATES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Update check completed successfully", AdminUpdatesModel.Get.Response),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);

		const [os, release] = await Promise.all([OSUpdates.check(), ZitadelReleases.check()]);
		await Audit.log(authContext.user_sub, "updates.check");

		return APIResponse.success(
			c,
			"Update check completed successfully",
			await buildStatus(os, release),
		);
	},
);
