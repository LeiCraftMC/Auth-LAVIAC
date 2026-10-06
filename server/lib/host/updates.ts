/**
 * OSUpdates — pending package updates of the host VM (Debian/Ubuntu, via apt).
 *
 * Runs `apt list --upgradable` against `LAVIAC_HOST_ROOT`, so in Docker it reports the host's
 * packages, not the container's: apt is re-rooted with `-o Dir=<root>` and reads the host's
 * sources, package lists and dpkg status through the read-only bind mount. Nothing is written —
 * the lists are as fresh as the host's own `apt update` (apt-daily timer); `listsUpdatedAt` says
 * when that last happened. The result is cached in `RuntimeMetadata` and refreshed by the cron
 * job (server/lib/utils/cron.ts) or on demand.
 */
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { RuntimeMetadata } from "../api/utils/metadata";
import type { HostData } from "../api/utils/shared-models/hostData";
import { Logger } from "../utils/logger";
import { HostInfo } from "./info";

const APT_TIMEOUT_MS = 120_000;

// `name/suite[,suite] candidate arch [upgradable from: current]`
const UPGRADABLE_LINE = /^([^\s/]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from: ([^\]]+)\]/;

export class OSUpdates {
	protected static running: Promise<HostData.OSUpdateStatus> | null = null;

	static async getStatus(): Promise<HostData.OSUpdateStatus> {
		return RuntimeMetadata.getOSUpdates();
	}

	/** Re-run the check and cache the result. Concurrent callers share one run. */
	static async check(): Promise<HostData.OSUpdateStatus> {
		if (!OSUpdates.running) {
			OSUpdates.running = OSUpdates.runCheck().finally(() => {
				OSUpdates.running = null;
			});
		}
		return OSUpdates.running;
	}

	protected static async runCheck(): Promise<HostData.OSUpdateStatus> {
		const [listsUpdatedAt, reboot] = await Promise.all([
			OSUpdates.getListsUpdatedAt(),
			OSUpdates.getRebootRequired(),
		]);

		const status: HostData.OSUpdateStatus = {
			supported: true,
			reason: null,
			checkedAt: Date.now(),
			listsUpdatedAt,
			rebootRequired: reboot.required,
			rebootPackages: reboot.packages,
			packages: [],
			error: null,
		};

		const apt = Bun.which("apt");
		if (!apt || !existsSync(HostInfo.hostPath("var/lib/dpkg/status"))) {
			status.supported = false;
			status.reason = apt
				? "The host has no dpkg database — only Debian/Ubuntu hosts are supported."
				: "apt is not available to LAVIAC — only Debian/Ubuntu hosts are supported.";
		} else {
			try {
				status.packages = await OSUpdates.listUpgradable(apt);
			} catch (err) {
				status.error = err instanceof Error ? err.message : String(err);
				Logger.error("OS update check failed:", err);
			}
		}

		await RuntimeMetadata.setOSUpdates(status);
		return status;
	}

	protected static async listUpgradable(apt: string): Promise<HostData.OSUpdatePackage[]> {
		const root = HostInfo.hostRoot();
		const options = [
			// read-only: no cache files, no locks
			"-o",
			"Dir::Cache::pkgcache=",
			"-o",
			"Dir::Cache::srcpkgcache=",
			"-o",
			"Debug::NoLocking=1",
		];
		if (root !== "/") {
			options.push(
				"-o",
				`Dir=${root}`,
				"-o",
				`Dir::State::status=${HostInfo.hostPath("var/lib/dpkg/status")}`,
			);
		}

		const proc = Bun.spawn([apt, "list", "--upgradable", ...options], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, LANG: "C", LC_ALL: "C" },
		});
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			proc.kill();
		}, APT_TIMEOUT_MS);

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]).finally(() => clearTimeout(timeout));

		if (timedOut) {
			throw new Error(`apt did not finish within ${APT_TIMEOUT_MS / 1000} s`);
		}

		if (exitCode !== 0) {
			// apt prints "WARNING: apt does not have a stable CLI interface" on every run — skip it.
			const message = stderr
				.split("\n")
				.filter((line) => line.trim() && !line.includes("stable CLI interface"))
				.join(" ")
				.trim();
			throw new Error(message || `apt exited with code ${exitCode}`);
		}

		const packages: HostData.OSUpdatePackage[] = [];
		for (const line of stdout.split("\n")) {
			const match = line.match(UPGRADABLE_LINE);
			if (!match?.[1] || !match[2] || !match[3] || !match[4]) continue;
			packages.push({
				name: match[1],
				origin: match[2],
				candidateVersion: match[3],
				currentVersion: match[4],
				security: /security/i.test(match[2]),
			});
		}

		return packages.sort(
			(a, b) => Number(b.security) - Number(a.security) || a.name.localeCompare(b.name),
		);
	}

	protected static async getListsUpdatedAt(): Promise<number | null> {
		const candidates = ["var/lib/apt/periodic/update-success-stamp", "var/lib/apt/lists"];
		let latest: number | null = null;
		for (const candidate of candidates) {
			try {
				const mtime = (await stat(HostInfo.hostPath(candidate))).mtimeMs;
				latest = Math.max(latest ?? 0, Math.round(mtime));
			} catch {
				// not present on this host
			}
		}
		return latest;
	}

	/** Debian/Ubuntu flag a pending reboot (e.g. after a kernel update) in /run/reboot-required. */
	protected static async getRebootRequired(): Promise<{ required: boolean; packages: string[] }> {
		// Read `run/` directly: on the host `var/run` is an absolute symlink to `/run`, which would
		// resolve inside the container instead of below LAVIAC_HOST_ROOT.
		const required = existsSync(HostInfo.hostPath("run/reboot-required"));
		if (!required) return { required: false, packages: [] };

		const packages = (await HostInfo.readHostFile("run/reboot-required.pkgs")) ?? "";
		return {
			required: true,
			packages: [
				...new Set(
					packages
						.split("\n")
						.map((p) => p.trim())
						.filter(Boolean),
				),
			],
		};
	}
}
