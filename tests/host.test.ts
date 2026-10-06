import { describe, expect, test } from "bun:test";
import { DB } from "../server/lib/db";
import { HostInfo } from "../server/lib/host/info";
import { HostMetrics } from "../server/lib/host/metrics";

describe("Host info", () => {
	test("reads memory, disks and CPU usage of the machine", async () => {
		const memory = await HostInfo.getMemory();
		expect(memory.total).toBeGreaterThan(0);
		expect(memory.used).toBeGreaterThanOrEqual(0);
		expect(memory.used).toBeLessThanOrEqual(memory.total);

		const disks = await HostInfo.getDisks();
		expect(disks.length).toBeGreaterThan(0);
		expect(disks[0]?.total).toBeGreaterThan(0);
		expect((disks[0]?.used ?? 0) + (disks[0]?.free ?? 0)).toBe(disks[0]?.total ?? -1);

		const usage = await HostInfo.sampleCpuUsage(100);
		if (usage !== null) {
			expect(usage).toBeGreaterThanOrEqual(0);
			expect(usage).toBeLessThanOrEqual(100);
		}
	});

	test("resolves host paths below LAVIAC_HOST_ROOT", () => {
		expect(HostInfo.hostPath("etc/os-release").replaceAll("\\", "/")).toEndWith("/etc/os-release");
	});
});

describe("Host metrics", () => {
	test("samples into the DB and serves bucketed series", async () => {
		const now = Date.now();
		await DB.instance()
			.insert(DB.Tables.hostMetrics)
			.values([
				{
					cpu_usage: 10,
					load_1: 1,
					mem_total: 100,
					mem_used: 50,
					swap_total: 0,
					swap_used: 0,
					disk_total: 200,
					disk_used: 50,
					created_at: now - 2 * 60 * 1000,
				},
				{
					cpu_usage: 30,
					load_1: 3,
					mem_total: 100,
					mem_used: 70,
					swap_total: 0,
					swap_used: 0,
					disk_total: 200,
					disk_used: 50,
					created_at: now - 60 * 1000,
				},
				{
					cpu_usage: 99,
					load_1: 9,
					mem_total: 100,
					mem_used: 99,
					swap_total: 0,
					swap_used: 0,
					disk_total: null,
					disk_used: null,
					// outside the 1h window
					created_at: now - 2 * 60 * 60 * 1000,
				},
			]);

		await HostMetrics.sample();

		const points = await HostMetrics.getSeries("1h");
		expect(points.length).toBe(3);
		expect(points[0]).toEqual({
			timestamp: now - 2 * 60 * 1000,
			cpuUsage: 10,
			load1: 1,
			memoryUsage: 50,
			diskUsage: 25,
		});
		expect(points[1]?.memoryUsage).toBe(70);

		const day = await HostMetrics.getSeries("24h");
		expect(day.length).toBe(4);
	});
});
