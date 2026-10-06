/**
 * Shared formatting helpers for timestamps, durations and sizes.
 */

/** Epoch milliseconds, or an ISO string as returned by the Zitadel System API. */
export function formatDate(ts: number | string | null | undefined): string {
	if (!ts) return "-";
	return new Date(ts).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatDateISO(ts: number | null | undefined): string {
	if (!ts) return "";
	const d = new Date(ts);
	d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString().slice(0, 16);
}

export function parseDateISO(value: string): number {
	if (!value) return 0;
	return new Date(value).getTime();
}

export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	return `${Math.floor(seconds / 86400)}d`;
}

/** Two-unit uptime, e.g. `12d 4h`, `3h 25m`, `42s`. */
export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m`;
	return `${Math.floor(seconds)}s`;
}

/** `5 min ago` style relative time for recent timestamps, falls back to {@link formatDate}. */
export function formatRelative(ts: number | string | null | undefined): string {
	if (!ts) return "never";
	const diffSeconds = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
	if (diffSeconds < 0) return formatDate(ts);
	if (diffSeconds < 60) return "just now";
	if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
	if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} h ago`;
	if (diffSeconds < 7 * 86400) return `${Math.floor(diffSeconds / 86400)} d ago`;
	return formatDate(ts);
}

/** Binary units: `512 B`, `3.4 GiB`. */
export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined) return "-";
	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** Compact counts: `1,284` / `12.9K` / `4.2M`. */
export function formatCount(value: number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	return new Intl.NumberFormat("en-US", {
		notation: value >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

export function formatPercent(value: number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}
