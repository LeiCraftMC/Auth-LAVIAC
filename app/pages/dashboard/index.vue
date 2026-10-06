<script setup lang="ts">
import { useUserInfoStore } from "~/composables/stores/useUserStore";
import type { AuditEntry, HostStatus, Statistics, UpdateStatus } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Dashboard | LAVIAC",
	description: "Overview of the Zitadel virtual instances and the host VM",
});

const userInfoStore = useUserInfoStore();
const user = await userInfoStore.use();
if (!userInfoStore.isValid(user)) {
	throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
}

const isAdmin = computed(() => user.value.user_role === "admin");

const statistics = await useAPILazyAsyncData<Statistics | null>(
	"dashboard-statistics",
	async () => {
		if (!isAdmin.value) return null;
		const res = await useAPI((api) => api.getAdminStatistics({}));
		return res.success ? res.data : null;
	},
);

const host = await useAPILazyAsyncData<HostStatus | null>("dashboard-host", async () => {
	if (!isAdmin.value) return null;
	const res = await useAPI((api) => api.getAdminHost({}));
	return res.success ? res.data : null;
});

const updates = await useAPILazyAsyncData<UpdateStatus | null>("dashboard-updates", async () => {
	if (!isAdmin.value) return null;
	const res = await useAPI((api) => api.getAdminUpdates({}));
	return res.success ? res.data : null;
});

const recentActivity = await useAPILazyAsyncData<AuditEntry[]>("dashboard-audit", async () => {
	if (!isAdmin.value) return [];
	const res = await useAPI((api) => api.getAdminAudit({ query: { limit: 8 } }));
	return res.success ? res.data.items : [];
});

const runningCount = computed(
	() =>
		statistics.data.value?.instances?.byState.find((s) => s.state === "STATE_RUNNING")?.count ?? 0,
);

const stats = computed(() => [
	{
		label: "Instances",
		value: statistics.data.value?.instances?.total ?? "-",
		hint: statistics.data.value?.instances ? `${runningCount.value} running` : undefined,
		icon: "i-lucide-server",
		iconClass: "text-primary-400",
		to: "/dashboard/instances",
		loading: statistics.loading.value,
	},
	{
		label: "Custom domains",
		value: statistics.data.value?.domains?.custom ?? "-",
		hint: statistics.data.value?.domains
			? `on ${statistics.data.value.domains.instancesWithCustomDomain} instances`
			: undefined,
		icon: "i-lucide-globe",
		iconClass: "text-emerald-400",
		to: "/dashboard/admin/statistics",
		loading: statistics.loading.value,
	},
	{
		label: "OS updates",
		value: updates.data.value?.os.supported ? updates.data.value.os.packages.length : "-",
		hint: updates.data.value?.os.supported
			? `${updates.data.value.os.packages.filter((p) => p.security).length} security`
			: "not available",
		icon: "i-lucide-package",
		iconClass: "text-amber-400",
		to: "/dashboard/admin/updates",
		loading: updates.loading.value,
	},
	{
		label: "Active sessions",
		value: statistics.data.value?.sessions.active ?? "-",
		hint: undefined,
		icon: "i-lucide-monitor-smartphone",
		iconClass: "text-slate-300",
		to: "/dashboard/admin/sessions",
		loading: statistics.loading.value,
	},
]);

const memoryUsage = computed(() =>
	host.data.value ? (host.data.value.memory.used / host.data.value.memory.total) * 100 : null,
);

const rootDisk = computed(() => host.data.value?.disks[0]);

const quickActions = [
	{
		label: "Create instance",
		description: "Provision a new Zitadel instance",
		icon: "i-lucide-plus",
		to: "/dashboard/instances/new",
		iconClass: "bg-primary/10 text-primary-400",
		hoverClass: "hover:border-primary/50",
	},
	{
		label: "System",
		description: "Host VM status and history",
		icon: "i-lucide-cpu",
		to: "/dashboard/admin/system",
		iconClass: "bg-emerald-500/10 text-emerald-400",
		hoverClass: "hover:border-emerald-500/50",
	},
	{
		label: "Updates",
		description: "OS packages and Zitadel releases",
		icon: "i-lucide-package-check",
		to: "/dashboard/admin/updates",
		iconClass: "bg-amber-500/10 text-amber-400",
		hoverClass: "hover:border-amber-500/50",
	},
];
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="Dashboard" icon="i-lucide-layout-dashboard" />
		</template>

		<template #body>
			<DashboardPageBody>
				<!-- Welcome -->
				<div class="flex items-center justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">Welcome back, {{ user.user_name || user.user_sub }}</h1>
						<p class="mt-1 text-slate-400">
							Here's how the virtual instances and their VM are doing.
						</p>
					</div>
					<UBadge v-if="isAdmin" color="primary" variant="soft" size="lg" icon="i-lucide-shield">
						Admin
					</UBadge>
				</div>

				<UAlert
					v-if="statistics.data.value?.zitadelError"
					color="error"
					variant="subtle"
					icon="i-lucide-alert-circle"
					title="The Zitadel System API is unreachable"
					:description="statistics.data.value.zitadelError"
				/>

				<!-- Stats -->
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<NuxtLink v-for="stat in stats" :key="stat.label" :to="stat.to">
						<DashboardStatCard
							:label="stat.label"
							:value="stat.value"
							:hint="stat.hint"
							:icon="stat.icon"
							:icon-class="stat.iconClass"
							:loading="stat.loading"
							class="transition hover:border-primary/50"
						/>
					</NuxtLink>
				</div>

				<div class="grid gap-6 lg:grid-cols-2">
					<!-- Host -->
					<DashboardSectionCard
						title="Host VM"
						:description="host.data.value ? `${host.data.value.hostname} · ${host.data.value.os.prettyName}` : 'Loading host status…'"
						icon="i-lucide-cpu"
					>
						<template #actions>
							<UButton
								label="Details"
								to="/dashboard/admin/system"
								color="neutral"
								variant="ghost"
								trailing-icon="i-lucide-arrow-right"
							/>
						</template>

						<div v-if="host.data.value" class="space-y-5">
							<ChartMeter
								label="CPU"
								:value="host.data.value.cpu.usage"
								:detail="`load ${host.data.value.cpu.loadAverage.join(' · ')} · ${host.data.value.cpu.cores} cores`"
							/>
							<ChartMeter
								label="Memory"
								:value="memoryUsage"
								:detail="`${formatBytes(host.data.value.memory.used)} of ${formatBytes(host.data.value.memory.total)}`"
							/>
							<ChartMeter
								v-if="rootDisk"
								label="Root disk"
								:value="(rootDisk.used / rootDisk.total) * 100"
								:detail="`${formatBytes(rootDisk.free)} free of ${formatBytes(rootDisk.total)}`"
							/>
							<div class="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4 text-sm">
								<UBadge color="neutral" variant="soft" icon="i-lucide-clock">
									Up {{ formatUptime(host.data.value.uptime) }}
								</UBadge>
								<UBadge
									:color="host.data.value.zitadel.reachable ? 'success' : 'error'"
									variant="soft"
									:icon="host.data.value.zitadel.reachable ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
								>
									Zitadel
									{{
										host.data.value.zitadel.reachable
											? `reachable · ${host.data.value.zitadel.latencyMs} ms`
											: "unreachable"
									}}
								</UBadge>
								<UBadge
									v-if="updates.data.value?.os.rebootRequired"
									color="warning"
									variant="soft"
									icon="i-lucide-rotate-ccw"
								>
									Reboot required
								</UBadge>
							</div>
						</div>
						<div v-else class="flex justify-center py-8">
							<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
						</div>
					</DashboardSectionCard>

					<!-- Newest instances -->
					<DashboardSectionCard
						title="Newest instances"
						description="The latest virtual instances"
						icon="i-lucide-server"
						flush
					>
						<template #actions>
							<UButton
								label="All instances"
								to="/dashboard/instances"
								color="neutral"
								variant="ghost"
								trailing-icon="i-lucide-arrow-right"
							/>
						</template>

						<ul v-if="statistics.data.value?.instances?.newest.length" class="divide-y divide-slate-800">
							<li v-for="instance in statistics.data.value.instances.newest" :key="instance.id">
								<NuxtLink
									:to="`/dashboard/instances/${instance.id}`"
									class="flex items-center justify-between gap-3 px-6 py-3 transition hover:bg-slate-800/40"
								>
									<div class="min-w-0">
										<p class="truncate font-medium text-white">{{ instance.name }}</p>
										<p class="text-xs text-slate-500">Created {{ formatRelative(instance.createdAt) }}</p>
									</div>
									<InstanceStateBadge :state="instance.state" />
								</NuxtLink>
							</li>
						</ul>
						<UEmpty
							v-else
							variant="naked"
							icon="i-lucide-server"
							title="No instances yet"
							description="Create the first virtual instance to get started."
							class="py-8"
						/>
					</DashboardSectionCard>
				</div>

				<!-- Recent activity -->
				<DashboardSectionCard
					title="Recent activity"
					description="The latest entries of the audit log"
					icon="i-lucide-scroll-text"
					flush
				>
					<template #actions>
						<UButton
							label="Audit log"
							to="/dashboard/admin/audit"
							color="neutral"
							variant="ghost"
							trailing-icon="i-lucide-arrow-right"
						/>
					</template>

					<ul v-if="recentActivity.data.value?.length" class="divide-y divide-slate-800">
						<li
							v-for="entry in recentActivity.data.value"
							:key="entry.id"
							class="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm"
						>
							<div class="flex min-w-0 items-center gap-3">
								<UBadge color="neutral" variant="soft" class="font-mono">{{ entry.action }}</UBadge>
								<span class="truncate text-slate-300">{{ entry.actor_sub }}</span>
								<span v-if="entry.detail" class="truncate text-slate-500">{{ entry.detail }}</span>
							</div>
							<span class="text-xs text-slate-500">{{ formatRelative(entry.created_at) }}</span>
						</li>
					</ul>
					<UEmpty
						v-else
						variant="naked"
						icon="i-lucide-scroll-text"
						title="No activity yet"
						class="py-8"
					/>
				</DashboardSectionCard>

				<!-- Quick actions -->
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<NuxtLink v-for="action in quickActions" :key="action.label" :to="action.to">
						<UCard :class="['border-slate-800 bg-slate-900/60 transition', action.hoverClass]">
							<div class="flex items-center gap-3">
								<div
									:class="['flex h-10 w-10 items-center justify-center rounded-lg', action.iconClass]"
								>
									<UIcon :name="action.icon" />
								</div>
								<div>
									<p class="font-semibold">{{ action.label }}</p>
									<p class="text-sm text-slate-400">{{ action.description }}</p>
								</div>
							</div>
						</UCard>
					</NuxtLink>
				</div>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
