<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { InstanceUsage, Statistics } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Statistics | LAVIAC",
	description: "Cross-instance statistics and LAVIAC activity",
});

const toast = useToast();

const statistics = await useAPIAsyncData<Statistics | null>("admin-statistics", async () => {
	const res = await useAPI((api) => api.getAdminStatistics({}));
	if (!res.success) {
		toast.add({ title: "Failed to load statistics", description: res.message, color: "error" });
		return null;
	}
	return res.data;
});

// Instance-scoped calls per instance — loaded lazily so the page renders immediately.
const forceUsageRefresh = ref(false);
const usage = await useAPILazyAsyncData<InstanceUsage | null>(
	"admin-statistics-usage",
	async () => {
		const refresh = forceUsageRefresh.value;
		forceUsageRefresh.value = false;
		const res = await useAPI((api) =>
			api.getAdminStatisticsUsage({ query: refresh ? { refresh: "true" } : {} }),
		);
		if (!res.success) {
			toast.add({ title: "Failed to load usage", description: res.message, color: "error" });
			return null;
		}
		return res.data;
	},
);

async function refreshUsage() {
	forceUsageRefresh.value = true;
	await usage.refresh();
}

const stats = computed(() => {
	const data = statistics.data.value;
	const running = data?.instances?.byState.find((s) => s.state === "STATE_RUNNING")?.count ?? 0;
	return [
		{
			label: "Instances",
			value: data?.instances?.total ?? "-",
			hint: data?.instances ? `${running} running` : undefined,
			icon: "i-lucide-server",
			iconClass: "text-primary-400",
			loading: statistics.loading.value,
		},
		{
			label: "Domains",
			value: data?.domains?.total ?? "-",
			hint: data?.domains ? `${data.domains.custom} custom` : undefined,
			icon: "i-lucide-globe",
			iconClass: "text-emerald-400",
			loading: statistics.loading.value,
		},
		{
			label: "Organizations",
			value: usage.data.value ? formatCount(usage.data.value.totals.orgs) : "-",
			hint: usage.data.value?.totals.unavailable
				? `${usage.data.value.totals.unavailable} instances unavailable`
				: "across all instances",
			icon: "i-lucide-building-2",
			iconClass: "text-amber-400",
			loading: usage.loading.value,
		},
		{
			label: "Users",
			value: usage.data.value ? formatCount(usage.data.value.totals.users) : "-",
			hint: "humans and machines",
			icon: "i-lucide-users",
			iconClass: "text-slate-300",
			loading: usage.loading.value,
		},
	];
});

const monthColumns = computed(() =>
	(statistics.data.value?.instances?.createdPerMonth ?? []).map((m) => {
		const date = new Date(`${m.month}-01T00:00:00Z`);
		return {
			key: m.month,
			label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
			title: date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
			value: m.count,
		};
	}),
);

const dayColumns = computed(() =>
	(statistics.data.value?.audit.perDay ?? []).map((d) => {
		const date = new Date(`${d.day}T00:00:00Z`);
		return {
			key: d.day,
			label: date.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
			title: date.toLocaleString("en-US", { dateStyle: "medium", timeZone: "UTC" }),
			value: d.count,
		};
	}),
);

const usageColumns: TableColumn<InstanceUsage["items"][number]>[] = [
	{ accessorKey: "name", header: "Instance" },
	{ accessorKey: "state", header: "State" },
	{ accessorKey: "orgs", header: "Organizations" },
	{ accessorKey: "users", header: "Users" },
	{ accessorKey: "error", header: "" },
];
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Statistics"
				icon="i-lucide-chart-column"
				description="Across all virtual instances"
			>
				<template #right>
					<UButton
						icon="i-lucide-refresh-cw"
						color="neutral"
						variant="ghost"
						label="Refresh"
						:loading="statistics.loading.value"
						@click="statistics.refresh()"
					/>
				</template>
			</DashboardPageHeader>
		</template>

		<template #body>
			<DashboardPageBody>
				<UAlert
					v-if="statistics.data.value?.zitadelError"
					color="error"
					variant="subtle"
					icon="i-lucide-alert-circle"
					title="Instance statistics are unavailable"
					:description="statistics.data.value.zitadelError"
				/>

				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<DashboardStatCard
						v-for="stat in stats"
						:key="stat.label"
						:label="stat.label"
						:value="stat.value"
						:hint="stat.hint"
						:icon="stat.icon"
						:icon-class="stat.iconClass"
						:loading="stat.loading"
					/>
				</div>

				<div class="grid gap-6 lg:grid-cols-2">
					<DashboardSectionCard
						title="New Instances"
						description="Instances created per month, last 12 months"
						icon="i-lucide-calendar-plus"
					>
						<ChartColumns
							v-if="monthColumns.length"
							:items="monthColumns"
							label="Instances created per month"
							:loading="statistics.loading.value"
						/>
						<UEmpty v-else variant="naked" icon="i-lucide-chart-column" title="No data" />
					</DashboardSectionCard>

					<DashboardSectionCard
						title="Audit Activity"
						description="LAVIAC actions per day, last 30 days (UTC)"
						icon="i-lucide-activity"
					>
						<ChartColumns
							:items="dayColumns"
							label="Audit log entries per day"
							:loading="statistics.loading.value"
						/>
					</DashboardSectionCard>
				</div>

				<div class="grid gap-6 lg:grid-cols-3">
					<DashboardSectionCard title="Instance States" icon="i-lucide-activity">
						<ul v-if="statistics.data.value?.instances?.byState.length" class="space-y-4">
							<li v-for="state in statistics.data.value.instances.byState" :key="state.state">
								<div class="flex items-center justify-between text-sm">
									<InstanceStateBadge :state="state.state" />
									<span class="font-semibold text-white">{{ state.count }}</span>
								</div>
								<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-500/15">
									<div
										class="h-full rounded-full bg-primary-500"
										:style="{ width: `${(state.count / statistics.data.value.instances.total) * 100}%` }"
									/>
								</div>
							</li>
						</ul>
						<UEmpty v-else variant="naked" icon="i-lucide-server" title="No instances" />
					</DashboardSectionCard>

					<DashboardSectionCard title="Zitadel Versions" description="As reported by the instances" icon="i-lucide-tag">
						<ul v-if="statistics.data.value?.instances?.versions.length" class="divide-y divide-slate-800">
							<li
								v-for="version in statistics.data.value.instances.versions"
								:key="version.version"
								class="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0"
							>
								<span class="font-mono text-slate-200">{{ version.version }}</span>
								<span class="text-slate-400">{{ version.count }} {{ version.count === 1 ? "instance" : "instances" }}</span>
							</li>
						</ul>
						<UEmpty v-else variant="naked" icon="i-lucide-tag" title="No data" />
					</DashboardSectionCard>

					<DashboardSectionCard title="Top Actions" description="Last 30 days" icon="i-lucide-scroll-text">
						<ul v-if="statistics.data.value?.audit.topActions.length" class="divide-y divide-slate-800">
							<li
								v-for="action in statistics.data.value.audit.topActions"
								:key="action.action"
								class="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0"
							>
								<NuxtLink
									:to="`/dashboard/admin/audit?action=${encodeURIComponent(action.action)}`"
									class="font-mono text-slate-200 hover:text-primary"
								>
									{{ action.action }}
								</NuxtLink>
								<span class="text-slate-400">{{ action.count }}</span>
							</li>
						</ul>
						<UEmpty v-else variant="naked" icon="i-lucide-scroll-text" title="No activity" />
					</DashboardSectionCard>
				</div>

				<DashboardDataTable
					:data="usage.data.value?.items ?? []"
					:columns="usageColumns"
					:loading="usage.loading"
					:show-refresh="false"
					:filters="[
						{ column: 'name', type: 'text', placeholder: 'Search instances...', icon: 'i-lucide-search' },
					]"
					empty-title="No usage data"
					empty-description="Usage counts need the system user's IAM_OWNER membership."
					empty-icon="i-lucide-users"
				>
					<template #header-right>
						<span v-if="usage.data.value" class="hidden text-xs text-slate-500 sm:inline">
							{{ usage.data.value.cached ? "Cached" : "Fetched" }} {{ formatRelative(usage.data.value.fetchedAt) }}
						</span>
						<UButton
							label="Recount"
							icon="i-lucide-refresh-cw"
							color="neutral"
							variant="outline"
							:loading="usage.loading.value"
							@click="refreshUsage"
						/>
					</template>

					<template #name-cell="{ row }">
						<NuxtLink
							:to="`/dashboard/instances/${row.original.instanceId}`"
							class="font-medium text-primary hover:underline"
						>
							{{ row.original.name }}
						</NuxtLink>
					</template>

					<template #state-cell="{ row }">
						<InstanceStateBadge :state="row.original.state" />
					</template>

					<template #orgs-cell="{ row }">
						<span class="tabular-nums">{{ formatCount(row.original.orgs) }}</span>
					</template>

					<template #users-cell="{ row }">
						<span class="tabular-nums">{{ formatCount(row.original.users) }}</span>
					</template>

					<template #error-cell="{ row }">
						<UTooltip v-if="row.original.error" :text="row.original.error">
							<UBadge color="warning" variant="soft" icon="i-lucide-alert-triangle" label="Unavailable" />
						</UTooltip>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
