<script setup lang="ts">
/**
 * Single-series line + area chart for a 0..max metric over time (inline SVG, no library).
 * Hover or arrow keys move a crosshair that snaps to the nearest sample; long gaps (LAVIAC
 * down, no samples yet) break the line instead of interpolating across them.
 */
const props = withDefaults(
	defineProps<{
		points: { timestamp: number; value: number | null }[];
		/** What is plotted — used for the accessible name and the data table. */
		label: string;
		unit?: string;
		max?: number;
		/** Visible time window; defaults to the data extent. */
		from?: number;
		to?: number;
		timeFormat?: Intl.DateTimeFormatOptions;
		loading?: boolean;
	}>(),
	{
		unit: "%",
		max: 100,
		from: undefined,
		to: undefined,
		timeFormat: () => ({ hour: "2-digit", minute: "2-digit" }),
		loading: false,
	},
);

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 100;

const plot = useTemplateRef<HTMLDivElement>("plot");
const activeIndex = ref<number | null>(null);

const domain = computed(() => {
	const first = props.points[0]?.timestamp ?? Date.now();
	const last = props.points[props.points.length - 1]?.timestamp ?? first;
	const from = props.from ?? first;
	const to = props.to ?? last;
	return { from, to: to > from ? to : from + 1 };
});

function xOf(timestamp: number) {
	const { from, to } = domain.value;
	return ((timestamp - from) / (to - from)) * VIEW_WIDTH;
}

function yOf(value: number) {
	const clamped = Math.min(Math.max(value, 0), props.max);
	return VIEW_HEIGHT - (clamped / props.max) * VIEW_HEIGHT;
}

/** Runs of consecutive samples, split at nulls and at gaps > 3× the median interval. */
const segments = computed(() => {
	const deltas = props.points
		.slice(1)
		.map((p, i) => p.timestamp - (props.points[i]?.timestamp ?? p.timestamp))
		.sort((a, b) => a - b);
	const median = deltas[Math.floor(deltas.length / 2)] ?? 0;
	const maxGap = median > 0 ? median * 3 : Number.POSITIVE_INFINITY;

	const result: { x: number; y: number }[][] = [];
	let current: { x: number; y: number }[] = [];
	let previousTimestamp: number | null = null;

	for (const point of props.points) {
		const gap = previousTimestamp !== null && point.timestamp - previousTimestamp > maxGap;
		if (point.value === null || gap) {
			if (current.length) result.push(current);
			current = [];
		}
		if (point.value !== null) {
			current.push({ x: xOf(point.timestamp), y: yOf(point.value) });
		}
		previousTimestamp = point.timestamp;
	}
	if (current.length) result.push(current);
	return result;
});

const linePath = computed(() =>
	segments.value
		.map((segment) =>
			segment.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(""),
		)
		.join(""),
);

const areaPath = computed(() =>
	segments.value
		.map((segment) => {
			const first = segment[0];
			const last = segment[segment.length - 1];
			if (!first || !last) return "";
			const line = segment.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("");
			return `M${first.x.toFixed(2)},${VIEW_HEIGHT}${line}L${last.x.toFixed(2)},${VIEW_HEIGHT}Z`;
		})
		.join(""),
);

const definedIndexes = computed(() =>
	props.points.flatMap((point, index) => (point.value === null ? [] : [index])),
);

/** The hovered sample, or the latest one as the end marker. */
const marker = computed(() => {
	const index = activeIndex.value ?? definedIndexes.value[definedIndexes.value.length - 1];
	const point = index === undefined ? undefined : props.points[index];
	if (!point || point.value === null) return null;
	return {
		point,
		left: (xOf(point.timestamp) / VIEW_WIDTH) * 100,
		top: (yOf(point.value) / VIEW_HEIGHT) * 100,
	};
});

function formatValue(value: number | null) {
	if (value === null) return "-";
	return `${value.toFixed(1)}${props.unit}`;
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString("en-US", props.timeFormat);
}

function onPointerMove(event: PointerEvent) {
	const rect = plot.value?.getBoundingClientRect();
	if (!rect || rect.width === 0 || definedIndexes.value.length === 0) return;

	const { from, to } = domain.value;
	const timestamp = from + ((event.clientX - rect.left) / rect.width) * (to - from);

	let nearest = definedIndexes.value[0] ?? null;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const index of definedIndexes.value) {
		const distance = Math.abs((props.points[index]?.timestamp ?? 0) - timestamp);
		if (distance < nearestDistance) {
			nearest = index;
			nearestDistance = distance;
		}
	}
	activeIndex.value = nearest;
}

function onKeydown(event: KeyboardEvent) {
	const indexes = definedIndexes.value;
	if (indexes.length === 0) return;

	const position =
		activeIndex.value === null ? indexes.length - 1 : indexes.indexOf(activeIndex.value);
	const next: Record<string, number> = {
		ArrowLeft: Math.max(0, position - 1),
		ArrowRight: Math.min(indexes.length - 1, position + 1),
		Home: 0,
		End: indexes.length - 1,
	};
	if (event.key in next) {
		event.preventDefault();
		activeIndex.value = indexes[next[event.key] ?? 0] ?? null;
	}
}

const summary = computed(() => {
	const values = props.points.flatMap((p) => (p.value === null ? [] : [p.value]));
	if (values.length === 0) return `${props.label}: no data`;
	return `${props.label}: latest ${formatValue(values[values.length - 1] ?? null)}, min ${formatValue(Math.min(...values))}, max ${formatValue(Math.max(...values))}`;
});
</script>

<template>
	<div :class="['transition-opacity', loading ? 'opacity-50' : '']">
		<div class="flex gap-2">
			<div
				class="flex h-40 w-10 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-slate-500"
				aria-hidden="true"
			>
				<span class="-translate-y-1/2">{{ max }}{{ unit }}</span>
				<span>{{ max / 2 }}{{ unit }}</span>
				<span class="translate-y-1/2">0{{ unit }}</span>
			</div>

			<div
				ref="plot"
				class="relative h-40 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
				tabindex="0"
				role="img"
				:aria-label="summary"
				@pointermove="onPointerMove"
				@pointerleave="activeIndex = null"
				@keydown="onKeydown"
				@blur="activeIndex = null"
			>
				<svg
					class="absolute inset-0 h-full w-full"
					:viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<line
						v-for="y in [0, VIEW_HEIGHT / 2, VIEW_HEIGHT]"
						:key="y"
						x1="0"
						:x2="VIEW_WIDTH"
						:y1="y"
						:y2="y"
						class="stroke-slate-800"
						stroke-width="1"
						vector-effect="non-scaling-stroke"
					/>
					<path :d="areaPath" class="fill-primary-500/10" />
					<path
						:d="linePath"
						fill="none"
						class="stroke-primary-400"
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
						vector-effect="non-scaling-stroke"
					/>
					<line
						v-if="activeIndex !== null && marker"
						:x1="(marker.left / 100) * VIEW_WIDTH"
						:x2="(marker.left / 100) * VIEW_WIDTH"
						y1="0"
						:y2="VIEW_HEIGHT"
						class="stroke-slate-500"
						stroke-width="1"
						vector-effect="non-scaling-stroke"
					/>
				</svg>

				<span
					v-if="marker"
					class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-400 ring-2 ring-slate-950"
					:style="{ left: `${marker.left}%`, top: `${marker.top}%` }"
				/>

				<div
					v-if="activeIndex !== null && marker"
					class="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs shadow-lg"
					:style="{
						left: `${marker.left}%`,
						top: `${marker.top}%`,
						transform: `translate(${marker.left < 15 ? '0' : marker.left > 85 ? '-100%' : '-50%'}, ${marker.top < 35 ? '14px' : 'calc(-100% - 14px)'})`,
					}"
				>
					<div class="flex items-center gap-1.5">
						<span class="h-0.5 w-3 rounded-full bg-primary-400" />
						<span class="font-semibold text-white">{{ formatValue(marker.point.value) }}</span>
					</div>
					<div class="mt-0.5 text-slate-400">{{ formatTime(marker.point.timestamp) }}</div>
				</div>

				<div
					v-if="definedIndexes.length === 0 && !loading"
					class="absolute inset-0 flex items-center justify-center text-sm text-slate-500"
				>
					No samples in this range yet
				</div>
			</div>
		</div>

		<div class="mt-1 ml-12 flex justify-between text-xs text-slate-500" aria-hidden="true">
			<span>{{ formatTime(domain.from) }}</span>
			<span>{{ formatTime(domain.to) }}</span>
		</div>

		<table class="sr-only">
			<caption>{{ label }}</caption>
			<thead>
				<tr>
					<th scope="col">Time</th>
					<th scope="col">{{ label }}</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="point in points" :key="point.timestamp">
					<td>{{ formatTime(point.timestamp) }}</td>
					<td>{{ formatValue(point.value) }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
