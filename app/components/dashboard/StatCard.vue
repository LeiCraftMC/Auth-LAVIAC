<script setup lang="ts">
/** The dashboard stat tile (docs/15 "Dashboard" overview cards): icon tile + value + label. */
withDefaults(
	defineProps<{
		label: string;
		value: string | number;
		icon: string;
		/** Static text color class for the icon, e.g. `text-primary-400`. */
		iconClass?: string;
		hint?: string;
		loading?: boolean;
	}>(),
	{
		iconClass: "text-primary-400",
		hint: undefined,
		loading: false,
	},
);
</script>

<template>
	<UCard class="h-full border-slate-800 bg-slate-900/60">
		<div class="flex items-center gap-4">
			<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800">
				<UIcon :name="icon" :class="['text-xl', iconClass]" />
			</div>
			<div class="min-w-0">
				<p class="truncate text-2xl font-bold text-white">{{ loading ? "…" : value }}</p>
				<p class="text-sm text-slate-400">{{ label }}</p>
				<p v-if="hint" class="truncate text-xs text-slate-500">{{ hint }}</p>
			</div>
		</div>
	</UCard>
</template>
