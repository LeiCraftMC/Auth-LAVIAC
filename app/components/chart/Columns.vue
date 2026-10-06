<script setup lang="ts">
/**
 * Single-series column chart for a handful of buckets (months, days). Columns are capped at
 * 24px with a 4px rounded cap and 2px gaps; every column is focusable and carries a tooltip
 * with its exact value, and the data is mirrored in a screen-reader table.
 */
const props = withDefaults(
	defineProps<{
		items: { key: string; label: string; value: number; title?: string }[];
		/** What is counted — used for the accessible name and the data table. */
		label: string;
		loading?: boolean;
	}>(),
	{
		loading: false,
	},
);

/** Round the scale up to 1/2/5 × 10ⁿ so the top tick is a clean number. */
const scaleMax = computed(() => {
	const max = Math.max(1, ...props.items.map((item) => item.value));
	const magnitude = 10 ** Math.floor(Math.log10(max));
	const step = [1, 2, 5, 10].find((s) => s * magnitude >= max) ?? 10;
	return step * magnitude;
});

const axisLabels = computed(() => {
	const items = props.items;
	if (items.length === 0) return [];
	const middle = items[Math.floor((items.length - 1) / 2)];
	return [items[0], middle, items[items.length - 1]].filter(
		(item, index, all) => item && all.indexOf(item) === index,
	);
});
</script>

<template>
	<div :class="['transition-opacity', loading ? 'opacity-50' : '']">
		<div class="flex gap-2">
			<div
				class="flex h-36 w-8 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-slate-500"
				aria-hidden="true"
			>
				<span class="-translate-y-1/2">{{ formatCount(scaleMax) }}</span>
				<span class="translate-y-1/2">0</span>
			</div>

			<div class="relative flex h-36 flex-1 items-end gap-0.5 border-b border-slate-800" role="list" :aria-label="label">
				<div class="pointer-events-none absolute inset-x-0 top-0 border-t border-slate-800/70" />

				<UTooltip
					v-for="item in items"
					:key="item.key"
					:text="`${item.title ?? item.label}: ${formatCount(item.value)}`"
					:content="{ side: 'top' }"
				>
					<div
						class="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
						tabindex="0"
						role="listitem"
						:aria-label="`${item.title ?? item.label}: ${item.value}`"
					>
						<div
							class="w-full max-w-6 rounded-t bg-primary-500 transition-colors group-hover:bg-primary-300 group-focus-visible:bg-primary-300"
							:style="{
								height: `${(item.value / scaleMax) * 100}%`,
								minHeight: item.value > 0 ? '2px' : '0',
							}"
						/>
					</div>
				</UTooltip>
			</div>
		</div>

		<div class="relative mt-1 ml-10 h-4 text-xs text-slate-500" aria-hidden="true">
			<span
				v-for="(item, index) in axisLabels"
				:key="item?.key"
				class="absolute top-0"
				:class="index === 0 ? 'left-0' : index === axisLabels.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'"
			>
				{{ item?.label }}
			</span>
		</div>

		<table class="sr-only">
			<caption>{{ label }}</caption>
			<tbody>
				<tr v-for="item in items" :key="item.key">
					<th scope="row">{{ item.title ?? item.label }}</th>
					<td>{{ item.value }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
