import os from "node:os";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { HostInfo } from "../../../../../../host/info";
import { HostMetrics } from "../../../../../../host/metrics";
import { ConfigHandler } from "../../../../../../utils/config";
import { ZitadelClient } from "../../../../../../zitadel/client";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminHostModel } from "./model";

export const router = new Hono().basePath("/host");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get host status",
		description:
			"Live facts about the VM LAVIAC runs on: OS, kernel, virtualization, CPU, memory, disks, the LAVIAC process and Zitadel reachability.",
		tags: [DOCS_TAGS.ADMIN_API.HOST],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Host status retrieved successfully", AdminHostModel.Get.Response),
		),
	}),

	async (c) => {
		const [hostname, osRelease, cpuUsage, memory, disks, databaseSize, zitadel] = await Promise.all([
			HostInfo.getHostname(),
			HostInfo.getOSRelease(),
			HostInfo.sampleCpuUsage(),
			HostInfo.getMemory(),
			HostInfo.getDisks(),
			HostInfo.getDatabaseSize(),
			ZitadelClient.health(),
		]);

		const cpus = os.cpus();
		const uptime = Math.round(os.uptime());

		return APIResponse.success(c, "Host status retrieved successfully", {
			hostname,
			os: osRelease,
			kernel: `${os.type()} ${os.release()}`,
			arch: os.arch(),
			uptime,
			bootedAt: Date.now() - uptime * 1000,
			virtualization: HostInfo.getVirtualization(),
			containerized: HostInfo.isContainerized(),
			hostRoot: HostInfo.hostRoot(),
			cpu: {
				model: cpus[0]?.model.trim() ?? "unknown",
				cores: cpus.length,
				loadAverage: os.loadavg().map((load) => Math.round(load * 100) / 100),
				usage: cpuUsage,
			},
			memory,
			disks,
			runtime: {
				bunVersion: Bun.version,
				pid: process.pid,
				uptime: Math.round(process.uptime()),
				rss: process.memoryUsage().rss,
				databaseSize,
			},
			zitadel: {
				url: ConfigHandler.getConfig()?.ZITADEL_SYSTEM_API_URL ?? null,
				...zitadel,
			},
		} satisfies AdminHostModel.Get.Response);
	},
);

router.get(
	"/metrics",

	APIRouteSpec.authenticated({
		summary: "Get host metrics",
		description:
			"CPU, load, memory and root-disk usage over time (sampled every minute, kept for 7 days).",
		tags: [DOCS_TAGS.ADMIN_API.HOST],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Host metrics retrieved successfully", AdminHostModel.Metrics.Response),
		),
	}),

	zValidator("query", AdminHostModel.Metrics.Query),

	async (c) => {
		const { range } = c.req.valid("query");

		return APIResponse.success(c, "Host metrics retrieved successfully", {
			range,
			sampleInterval: 60,
			points: await HostMetrics.getSeries(range),
		} satisfies AdminHostModel.Metrics.Response);
	},
);
