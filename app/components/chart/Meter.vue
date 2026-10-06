<script setup lang="ts">
/**
 * Usage meter (0–100 %). The fill carries the severity (primary → amber → red) over a track
 * from the same color, and a warning/critical state is also spelled out with an icon + label.
 */
const props = withDefaults(
	defineProps<{
		label: string;
		value: number | null;
		detail?: string;
		warnAt?: number;
		criticalAt?: number;
	}>(),
	{
		detail: undefined,
		warnAt: 80,
		criticalAt: 90,
	},
);

// Static class names so Tailwind picks them up (no interpolated color classes).
const SEVERITIES = {
	ok: { fill: "bg-primary-500", track: "bg-primary-500/15", icon: "", iconClass: "", text: "" },
	warning: {
		fill: "bg-amber-500",
		track: "bg-amber-500/15",
		icon: "i-lucide-alert-triangle",
		iconClass: "text-amber-400",
		text: "High",
	},
	critical: {
		fill: "bg-red-500",
		track: "bg-red-500/15",
		icon: "i-lucide-octagon-alert",
		iconClass: "text-red-400",
		text: "Critical",
	},
} as const;

const severity = computed(() => {
	const value = props.value ?? 0;
	if (value >= props.criticalAt) return SEVERITIES.critical;
	if (value >= props.warnAt) return SEVERITIES.warning;
	return SEVERITIES.ok;
});

const width = computed(() => `${Math.min(Math.max(props.value ?? 0, 0), 100)}%`);
</script>

<template>
	<div>
		<div class="flex items-baseline justify-between gap-2 text-sm">
			<span class="text-slate-300">{{ label }}</span>
			<span class="font-semibold text-white">{{ formatPercent(value) }}</span>
		</div>

		<div
			class="mt-1.5 h-2 overflow-hidden rounded-full"
			:class="severity.track"
			role="meter"
			:aria-label="label"
			aria-valuemin="0"
			aria-valuemax="100"
			:aria-valuenow="value ?? undefined"
		>
			<div class="h-full rounded-full transition-[width] duration-500" :class="severity.fill" :style="{ width }" />
		</div>

		<div v-if="detail || severity.text" class="mt-1 flex items-center justify-between gap-2 text-xs">
			<span class="text-slate-500">{{ detail }}</span>
			<span v-if="severity.text" class="flex items-center gap-1 text-slate-300">
				<UIcon :name="severity.icon" :class="severity.iconClass" />
				{{ severity.text }}
			</span>
		</div>
	</div>
</template>
