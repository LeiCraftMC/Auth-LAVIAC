/**
 * HostInfo — live facts about the VM LAVIAC (and Zitadel) run on.
 *
 * Kernel-wide values (uptime, load, CPU times, `/proc/meminfo`) are the host's even inside a
 * container. Filesystem facts (OS release, hostname, disk usage) are read below
 * `LAVIAC_HOST_ROOT` — `/` on bare metal, the read-only bind mount of the host's `/` (e.g.
 * `/host`) in Docker. Off Linux everything falls back to `node:os`.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat, statfs } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { ConfigHandler } from "../utils/config";

export class HostInfo {
	protected static metricsCpuBaseline: HostInfo.CpuTimes | null = null;

	static hostRoot() {
		return ConfigHandler.getConfig()?.HOST_ROOT ?? "/";
	}

	/** Resolve a host path (e.g. `etc/os-release`) below `LAVIAC_HOST_ROOT`. */
	static hostPath(relativePath: string) {
		return join(HostInfo.hostRoot(), relativePath);
	}

	static async readHostFile(relativePath: string): Promise<string | null> {
		try {
			return await readFile(HostInfo.hostPath(relativePath), "utf8");
		} catch {
			return null;
		}
	}

	static async getHostname(): Promise<string> {
		if (HostInfo.hostRoot() !== "/") {
			const hostname = (await HostInfo.readHostFile("etc/hostname"))?.trim();
			if (hostname) return hostname;
		}
		return os.hostname();
	}

	static async getOSRelease(): Promise<HostInfo.OSRelease> {
		const raw = await HostInfo.readHostFile("etc/os-release");
		if (!raw) {
			return {
				name: os.type(),
				version: os.release(),
				id: os.platform(),
				prettyName: `${os.type()} ${os.release()}`,
			};
		}

		const fields = new Map<string, string>();
		for (const line of raw.split("\n")) {
			const match = line.match(/^([A-Z_]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				fields.set(match[1], match[2].replace(/^"(.*)"$/, "$1"));
			}
		}

		const name = fields.get("NAME") ?? os.type();
		return {
			name,
			version: fields.get("VERSION") ?? fields.get("VERSION_ID") ?? null,
			id: fields.get("ID") ?? null,
			prettyName: fields.get("PRETTY_NAME") ?? name,
		};
	}

	static getVirtualization(): HostInfo.Virtualization {
		const read = (path: string) => {
			try {
				return readFileSync(path, "utf8").trim() || null;
			} catch {
				return null;
			}
		};

		const cpuinfo = read("/proc/cpuinfo") ?? "";
		return {
			virtual: /^flags\s*:.*\bhypervisor\b/m.test(cpuinfo),
			vendor: read("/sys/class/dmi/id/sys_vendor"),
			product: read("/sys/class/dmi/id/product_name"),
		};
	}

	/** Running inside a container (Docker/Podman/containerd)? */
	static isContainerized(): boolean {
		if (existsSync("/.dockerenv") || existsSync("/run/.containerenv")) return true;
		try {
			return /docker|containerd|kubepods|libpod/.test(readFileSync("/proc/1/cgroup", "utf8"));
		} catch {
			return false;
		}
	}

	static readCpuTimes(): HostInfo.CpuTimes {
		let idle = 0;
		let total = 0;
		for (const cpu of os.cpus()) {
			const { user, nice, sys, idle: cpuIdle, irq } = cpu.times;
			idle += cpuIdle;
			total += user + nice + sys + cpuIdle + irq;
		}
		return { idle, total };
	}

	protected static cpuUsageBetween(start: HostInfo.CpuTimes, end: HostInfo.CpuTimes) {
		const totalDelta = end.total - start.total;
		if (totalDelta <= 0) return null;
		const usage = (1 - (end.idle - start.idle) / totalDelta) * 100;
		return Math.min(100, Math.max(0, Math.round(usage * 10) / 10));
	}

	/** CPU usage in percent over a fresh window — for live requests. */
	static async sampleCpuUsage(windowMs = 500): Promise<number | null> {
		const start = HostInfo.readCpuTimes();
		await Bun.sleep(windowMs);
		return HostInfo.cpuUsageBetween(start, HostInfo.readCpuTimes());
	}

	/**
	 * CPU usage since the previous call, so each per-minute metrics sample covers the whole
	 * minute. Owned by the metrics cron job — live requests use {@link sampleCpuUsage}, which
	 * leaves this baseline alone. Without a usable baseline it measures a short window instead.
	 */
	static async getCpuUsageSinceLastSample(): Promise<number | null> {
		const previous = HostInfo.metricsCpuBaseline;
		const current = HostInfo.readCpuTimes();
		HostInfo.metricsCpuBaseline = current;

		// os.cpus() times are in ms summed over all cores — below 1 s the reading is too coarse.
		if (!previous || current.total - previous.total < 1000) {
			return HostInfo.sampleCpuUsage();
		}
		return HostInfo.cpuUsageBetween(previous, current);
	}

	static async getMemory(): Promise<HostInfo.Memory> {
		try {
			const raw = await readFile("/proc/meminfo", "utf8");
			const kib = (key: string) => {
				const match = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
				return match?.[1] ? Number(match[1]) * 1024 : 0;
			};

			const total = kib("MemTotal");
			const available = kib("MemAvailable") || kib("MemFree");
			const swapTotal = kib("SwapTotal");
			return {
				total,
				used: total - available,
				available,
				swapTotal,
				swapUsed: swapTotal - kib("SwapFree"),
			};
		} catch {
			const total = os.totalmem();
			const available = os.freemem();
			return { total, used: total - available, available, swapTotal: 0, swapUsed: 0 };
		}
	}

	protected static async getDisk(label: string, path: string): Promise<HostInfo.Disk | null> {
		try {
			const fsStats = await statfs(path);
			// df semantics: blocks reserved for root count neither as used nor as free, so `total`
			// is used + available and a disk that is full for LAVIAC reads 100 %.
			const used = (fsStats.blocks - fsStats.bfree) * fsStats.bsize;
			const free = fsStats.bavail * fsStats.bsize;
			return { label, path, total: used + free, used, free };
		} catch {
			return null;
		}
	}

	/** The host's root filesystem plus LAVIAC's data volume when it lives on another device. */
	static async getDisks(): Promise<HostInfo.Disk[]> {
		const hostRoot = HostInfo.hostRoot();
		const dataDir = dirname(ConfigHandler.getConfig()?.DB_PATH ?? "./data/db.sqlite");

		const disks: HostInfo.Disk[] = [];
		const rootDisk = await HostInfo.getDisk("Host root (/)", hostRoot);
		if (rootDisk) disks.push(rootDisk);

		try {
			const [rootDev, dataDev] = await Promise.all([stat(hostRoot), stat(dataDir)]);
			if (rootDev.dev !== dataDev.dev) {
				const dataDisk = await HostInfo.getDisk("LAVIAC data", dataDir);
				if (dataDisk) disks.push(dataDisk);
			}
		} catch {
			// the data dir may not exist yet (e.g. api-client generation) — root only
		}

		return disks;
	}

	static async getDatabaseSize(): Promise<number | null> {
		try {
			return (await stat(ConfigHandler.getConfig()?.DB_PATH ?? "./data/db.sqlite")).size;
		} catch {
			return null;
		}
	}
}

export namespace HostInfo {
	export interface OSRelease {
		name: string;
		version: string | null;
		id: string | null;
		prettyName: string;
	}

	export interface Virtualization {
		/** The CPU reports a hypervisor (`hypervisor` flag in /proc/cpuinfo). */
		virtual: boolean;
		vendor: string | null;
		product: string | null;
	}

	export interface Memory {
		total: number;
		used: number;
		available: number;
		swapTotal: number;
		swapUsed: number;
	}

	export interface Disk {
		label: string;
		path: string;
		total: number;
		used: number;
		free: number;
	}

	export interface CpuTimes {
		idle: number;
		total: number;
	}
}
