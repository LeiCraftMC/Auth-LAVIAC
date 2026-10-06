/**
 * Instance display helpers — one source for state badges and the primary domain, so the
 * list, the detail pages and the statistics stay consistent (like `getRoleColor`).
 */
import type { Instance } from "~/utils/types";

type BadgeColor = "success" | "info" | "warning" | "error" | "neutral";

const INSTANCE_STATES: Record<string, { label: string; color: BadgeColor; icon: string }> = {
	STATE_RUNNING: { label: "Running", color: "success", icon: "i-lucide-circle-check" },
	STATE_CREATING: { label: "Creating", color: "info", icon: "i-lucide-loader" },
	STATE_DELETING: { label: "Deleting", color: "warning", icon: "i-lucide-trash-2" },
	STATE_STOPPED: { label: "Stopped", color: "error", icon: "i-lucide-circle-stop" },
	STATE_UNSPECIFIED: { label: "Unspecified", color: "neutral", icon: "i-lucide-circle-help" },
};

export function getInstanceState(state: string | null | undefined) {
	return (
		INSTANCE_STATES[state ?? ""] ?? {
			label: state ?? "Unknown",
			color: "neutral" as BadgeColor,
			icon: "i-lucide-circle-help",
		}
	);
}

export const INSTANCE_STATE_OPTIONS = Object.entries(INSTANCE_STATES).map(([value, state]) => ({
	label: state.label,
	value,
}));

export function getPrimaryDomain(instance: Pick<Instance, "domains">): string | undefined {
	return instance.domains?.find((d) => d.primary)?.domain ?? instance.domains?.[0]?.domain;
}
