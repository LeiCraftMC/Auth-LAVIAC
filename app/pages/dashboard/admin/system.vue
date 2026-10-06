<script setup lang="ts">
import type { HostMetrics, HostMetricsRange, HostStatus } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "System | LAVIAC",
	description: "Status and history of the host VM",
});

const toast = useToast();

const host = await useAPIAsyncData<HostStatus | null>("admin-host", async () => {
	const res = await useAPI((api) => api.getAdminHost({}));
	if (!res.success) {
		toast.add({ title: "Failed to load the host status", description: res.message, color: "error" });
		return null;
	}
	return res.data;
});

const RANGE_MS: Record<HostMetricsRange, number> = {
	"1h": 60 * 60 * 1000,
	"24h": 24 * 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
};

const ranges = [
	{ label: "Last hour", value: "1h" },
	{ label: "Last 24 hours", value: "24h" },
	{ label: "Last 7 days", value: "7d" },
] satisfies { label: string; value: HostMetricsRange }[];

const range = ref<HostMetricsRange>("24h");
const timeWindow = ref({ from: Date.now() - RANGE_MS["24h"], to: Date.now() });

const metrics = await useAPILazyAsyncData<HostMetrics | null>("admin-host-metrics", async () => {
	const res = await useAPI((api) => api.getAdminHostMetrics({ query: { range: range.value } }));
	timeWindow.value = { from: Date.now() - RANGE_MS[range.value], to: Date.now() };
	return res.success ? res.data : null;
});

watch(range, () => metrics.refresh());

const timeFormat = computed<Intl.DateTimeFormatOptions>(() =>
	range.value === "7d"
		? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
		: { hour: "2-digit", minute: "2-digit" },
);

const series = computed(() => {
	const points = metrics.data.value?.points ?? [];
	return [
		{
			label: "CPU usage",
			points: points.map((p) => ({ timestamp: p.timestamp, value: p.cpuUsage })),
		},
		{
			label: "Memory usage",
			points: points.map((p) => ({ timestamp: p.timestamp, value: p.memoryUsage })),
		},
		{
			label: "Root disk usage",
			points: points.map((p) => ({ timestamp: p.timestamp, value: p.diskUsage })),
		},
	];
});

// Live view: refresh the snapshot every 30 s while the page is open.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
	interval = setInterval(() => host.refresh(), 30_000);
});
onBeforeUnmount(() => {
	if (interval) clearInterval(interval);
});

async function refreshAll() {
	await Promise.all([host.refresh(), metrics.refresh()]);
}

const percent = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

const facts = computed(() => {
	const data = host.data.value;
	if (!data) return [];
	const virtualization = data.virtualization.virtual
		? [data.virtualization.vendor, data.virtualization.product].filter(Boolean).join(" · ") ||
			"Virtual machine"
		: "Bare metal (no hypervisor detected)";

	return [
		{ label: "Hostname", value: data.hostname },
		{ label: "Operating system", value: data.os.prettyName },
		{ label: "Kernel", value: `${data.kernel} (${data.arch})` },
		{ label: "Virtualization", value: virtualization },
		{ label: "Uptime", value: `${formatUptime(data.uptime)} — since ${formatDate(data.bootedAt)}` },
		{ label: "CPU", value: `${data.cpu.model} · ${data.cpu.cores} cores` },
	];
});
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="System" icon="i-lucide-cpu" description="The host VM">
				<template #right>
					<UButton
						icon="i-lucide-refresh-cw"
						color="neutral"
						variant="ghost"
						label="Refresh"
						:loading="host.loading.value"
						@click="refreshAll"
					/>
				</template>
			</DashboardPageHeader>
		</template>

		<template #body>
			<DashboardPageBody>
				<div v-if="!host.data.value" class="flex justify-center py-12">
					<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
				</div>

				<template v-else>
					<UAlert
						v-if="host.data.value.containerized && host.data.value.hostRoot === '/'"
						color="warning"
						variant="subtle"
						icon="i-lucide-container"
						title="LAVIAC runs in a container without the host filesystem"
						description="Kernel values (CPU, load, memory, uptime) are the host's, but the OS release, hostname, disk and package updates describe the container. Mount the host's / read-only (e.g. /:/host:ro) and set LAVIAC_HOST_ROOT=/host."
					/>

					<div class="grid gap-6 lg:grid-cols-2">
						<DashboardSectionCard
							title="Host"
							:description="host.data.value.containerized ? `Read through ${host.data.value.hostRoot}` : 'LAVIAC runs directly on the host'"
							icon="i-lucide-server-cog"
						>
							<dl class="grid gap-4 text-sm sm:grid-cols-2">
								<div v-for="fact in facts" :key="fact.label">
									<dt class="text-slate-500">{{ fact.label }}</dt>
									<dd class="mt-0.5 text-slate-200">{{ fact.value }}</dd>
								</div>
							</dl>
						</DashboardSectionCard>

						<DashboardSectionCard title="Usage" description="Live — refreshed every 30 seconds" icon="i-lucide-gauge">
							<div class="space-y-5">
								<ChartMeter
									label="CPU"
									:value="host.data.value.cpu.usage"
									:detail="`load ${host.data.value.cpu.loadAverage.join(' · ')} (1 · 5 · 15 min)`"
								/>
								<ChartMeter
									label="Memory"
									:value="percent(host.data.value.memory.used, host.data.value.memory.total)"
									:detail="`${formatBytes(host.data.value.memory.used)} of ${formatBytes(host.data.value.memory.total)}`"
								/>
								<ChartMeter
									v-if="host.data.value.memory.swapTotal > 0"
									label="Swap"
									:value="percent(host.data.value.memory.swapUsed, host.data.value.memory.swapTotal)"
									:detail="`${formatBytes(host.data.value.memory.swapUsed)} of ${formatBytes(host.data.value.memory.swapTotal)}`"
								/>
								<ChartMeter
									v-for="disk in host.data.value.disks"
									:key="disk.path"
									:label="disk.label"
									:value="percent(disk.used, disk.total)"
									:detail="`${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`"
								/>
							</div>
						</DashboardSectionCard>
					</div>

					<DashboardSectionCard title="History" description="Sampled every minute, kept for 7 days" icon="i-lucide-chart-line">
						<template #actions>
							<UTabs
								v-model="range"
								:items="ranges"
								:content="false"
								size="xs"
								color="neutral"
								variant="link"
							/>
						</template>

						<div class="grid gap-8 xl:grid-cols-3">
							<div v-for="chart in series" :key="chart.label">
								<h4 class="mb-3 text-sm font-medium text-slate-300">{{ chart.label }}</h4>
								<ChartTimeSeries
									:points="chart.points"
									:label="chart.label"
									:from="timeWindow.from"
									:to="timeWindow.to"
									:time-format="timeFormat"
									:loading="metrics.loading.value"
								/>
							</div>
						</div>
					</DashboardSectionCard>

					<div class="grid gap-6 lg:grid-cols-2">
						<DashboardSectionCard title="Zitadel" description="System API reachability" icon="i-lucide-shield-check">
							<div class="flex flex-wrap items-center gap-3 text-sm">
								<UBadge
									:color="host.data.value.zitadel.reachable ? 'success' : 'error'"
									:icon="host.data.value.zitadel.reachable ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
									variant="soft"
									:label="host.data.value.zitadel.reachable ? 'Reachable' : 'Unreachable'"
								/>
								<span class="text-slate-300">{{ host.data.value.zitadel.url ?? "not configured" }}</span>
								<span v-if="host.data.value.zitadel.latencyMs !== null" class="text-slate-500">
									{{ host.data.value.zitadel.latencyMs }} ms
								</span>
							</div>
							<p v-if="host.data.value.zitadel.error" class="mt-3 text-sm text-slate-400">
								{{ host.data.value.zitadel.error }}
							</p>
						</DashboardSectionCard>

						<DashboardSectionCard title="LAVIAC" description="This console's own process" icon="i-lucide-box">
							<dl class="grid gap-4 text-sm sm:grid-cols-2">
								<div>
									<dt class="text-slate-500">Runtime</dt>
									<dd class="mt-0.5 text-slate-200">Bun {{ host.data.value.runtime.bunVersion }}</dd>
								</div>
								<div>
									<dt class="text-slate-500">Process uptime</dt>
									<dd class="mt-0.5 text-slate-200">{{ formatUptime(host.data.value.runtime.uptime) }}</dd>
								</div>
								<div>
									<dt class="text-slate-500">Memory (RSS)</dt>
									<dd class="mt-0.5 text-slate-200">{{ formatBytes(host.data.value.runtime.rss) }}</dd>
								</div>
								<div>
									<dt class="text-slate-500">Database</dt>
									<dd class="mt-0.5 text-slate-200">{{ formatBytes(host.data.value.runtime.databaseSize) }}</dd>
								</div>
							</dl>
						</DashboardSectionCard>
					</div>
				</template>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
