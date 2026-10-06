/**
 * HostMetrics — per-minute samples of the host VM (CPU, load, memory, root disk), written by
 * the cron job in server/lib/utils/cron.ts and served as time series to the System page.
 */

import os from "node:os";
import { asc, gte, lt } from "drizzle-orm";
import { DB } from "../db";
import { Logger } from "../utils/logger";
import { HostInfo } from "./info";

export class HostMetrics {
	static readonly RETENTION_DAYS = 7;

	static readonly RANGES = {
		"1h": 60 * 60 * 1000,
		"24h": 24 * 60 * 60 * 1000,
		"7d": 7 * 24 * 60 * 60 * 1000,
	} as const;

	/** Max points per series — longer ranges are averaged into buckets. */
	static readonly MAX_POINTS = 240;

	static async sample() {
		try {
			const [cpuUsage, memory, disks] = await Promise.all([
				HostInfo.getCpuUsageSinceLastSample(),
				HostInfo.getMemory(),
				HostInfo.getDisks(),
			]);
			const rootDisk = disks[0];

			await DB.instance()
				.insert(DB.Tables.hostMetrics)
				.values({
					cpu_usage: cpuUsage,
					load_1: os.loadavg()[0] ?? 0,
					mem_total: memory.total,
					mem_used: memory.used,
					swap_total: memory.swapTotal,
					swap_used: memory.swapUsed,
					disk_total: rootDisk?.total ?? null,
					disk_used: rootDisk?.used ?? null,
				});
		} catch (err) {
			Logger.error("Failed to sample host metrics:", err);
		}
	}

	static async prune() {
		const cutoff = Date.now() - HostMetrics.RETENTION_DAYS * 24 * 60 * 60 * 1000;
		await DB.instance()
			.delete(DB.Tables.hostMetrics)
			.where(lt(DB.Tables.hostMetrics.created_at, cutoff));
	}

	/** Samples within `range`, averaged into at most {@link MAX_POINTS} buckets. */
	static async getSeries(range: HostMetrics.Range): Promise<HostMetrics.Point[]> {
		const since = Date.now() - HostMetrics.RANGES[range];
		const rows = await DB.instance()
			.select()
			.from(DB.Tables.hostMetrics)
			.where(gte(DB.Tables.hostMetrics.created_at, since))
			.orderBy(asc(DB.Tables.hostMetrics.created_at))
			.all();

		const bucketSize = Math.max(1, Math.ceil(rows.length / HostMetrics.MAX_POINTS));
		const points: HostMetrics.Point[] = [];

		for (let i = 0; i < rows.length; i += bucketSize) {
			const bucket = rows.slice(i, i + bucketSize);
			const average = (values: number[]) =>
				values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
			const percent = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);
			const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

			const last = bucket[bucket.length - 1];
			if (!last) continue;

			points.push({
				timestamp: last.created_at,
				cpuUsage: round(
					average(bucket.flatMap((row) => (row.cpu_usage === null ? [] : [row.cpu_usage]))),
				),
				load1: round(average(bucket.map((row) => row.load_1))) ?? 0,
				memoryUsage: round(average(bucket.map((row) => percent(row.mem_used, row.mem_total)))) ?? 0,
				diskUsage: round(
					average(
						bucket.flatMap((row) =>
							row.disk_total && row.disk_used !== null ? [percent(row.disk_used, row.disk_total)] : [],
						),
					),
				),
			});
		}

		return points;
	}
}

export namespace HostMetrics {
	export type Range = keyof typeof HostMetrics.RANGES;

	export interface Point {
		timestamp: number;
		cpuUsage: number | null;
		load1: number;
		memoryUsage: number;
		diskUsage: number | null;
	}
}
