import { z } from "zod";

export namespace AdminHostModel {
	export const Disk = z.object({
		label: z.string(),
		path: z.string(),
		total: z.number(),
		used: z.number(),
		free: z.number(),
	});
	export type Disk = z.infer<typeof Disk>;
}

export namespace AdminHostModel.Get {
	export const Response = z.object({
		hostname: z.string(),
		os: z.object({
			name: z.string(),
			version: z.string().nullable(),
			id: z.string().nullable(),
			prettyName: z.string(),
		}),
		kernel: z.string(),
		arch: z.string(),
		/** Host uptime in seconds. */
		uptime: z.number(),
		bootedAt: z.number(),
		virtualization: z.object({
			virtual: z.boolean(),
			vendor: z.string().nullable(),
			product: z.string().nullable(),
		}),
		containerized: z.boolean(),
		/** Where LAVIAC reads the host filesystem (`LAVIAC_HOST_ROOT`). */
		hostRoot: z.string(),
		cpu: z.object({
			model: z.string(),
			cores: z.number(),
			/** 1, 5 and 15 minute load averages. */
			loadAverage: z.array(z.number()),
			/** Percent; `null` when it could not be measured. */
			usage: z.number().nullable(),
		}),
		memory: z.object({
			total: z.number(),
			used: z.number(),
			available: z.number(),
			swapTotal: z.number(),
			swapUsed: z.number(),
		}),
		disks: z.array(AdminHostModel.Disk),
		runtime: z.object({
			bunVersion: z.string(),
			pid: z.number(),
			/** LAVIAC process uptime in seconds. */
			uptime: z.number(),
			rss: z.number(),
			databaseSize: z.number().nullable(),
		}),
		zitadel: z.object({
			url: z.string().nullable(),
			reachable: z.boolean(),
			statusCode: z.number().nullable(),
			latencyMs: z.number().nullable(),
			error: z.string().nullable(),
		}),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace AdminHostModel.Metrics {
	export const Query = z.object({
		range: z.enum(["1h", "24h", "7d"]).default("24h"),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = z.object({
		range: z.enum(["1h", "24h", "7d"]),
		/** Sampling interval of the raw data in seconds. */
		sampleInterval: z.number(),
		points: z.array(
			z.object({
				timestamp: z.number(),
				cpuUsage: z.number().nullable(),
				load1: z.number(),
				memoryUsage: z.number(),
				diskUsage: z.number().nullable(),
			}),
		),
	});
	export type Response = z.infer<typeof Response>;
}
