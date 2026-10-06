<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Row } from "@tanstack/vue-table";
import type { OSUpdatePackage, UpdateStatus } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Updates | LAVIAC",
	description: "OS package updates of the host VM and Zitadel releases",
});

const toast = useToast();

const status = await useAPIAsyncData<UpdateStatus | null>("admin-updates", async () => {
	const res = await useAPI((api) => api.getAdminUpdates({}));
	if (!res.success) {
		toast.add({
			title: "Failed to load the update status",
			description: res.message,
			color: "error",
		});
		return null;
	}
	return res.data;
});

const checking = ref(false);

async function checkNow() {
	checking.value = true;
	const res = await useAPI((api) => api.postAdminUpdatesCheck({}));
	checking.value = false;

	if (!res.success) {
		toast.add({
			title: "Update check failed",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	status.data.value = res.data;
	toast.add({ title: "Update check completed", icon: "i-lucide-check", color: "success" });
}

const os = computed(() => status.data.value?.os ?? null);
const zitadel = computed(() => status.data.value?.zitadel ?? null);
const securityCount = computed(() => os.value?.packages.filter((p) => p.security).length ?? 0);

const columns: TableColumn<OSUpdatePackage>[] = [
	{ accessorKey: "name", header: "Package" },
	{ accessorKey: "currentVersion", header: "Installed" },
	{ accessorKey: "candidateVersion", header: "Available" },
	{ accessorKey: "origin", header: "Source" },
	{ accessorKey: "security", header: "Type" },
];

// The built-in select filter treats `false` as "no filter", so match on string values.
const typeFilter = {
	column: "security" as const,
	type: "select" as const,
	placeholder: "All types",
	options: [
		{ label: "Security", value: "security" },
		{ label: "Regular", value: "regular" },
	],
	filterFn: (row: Row<OSUpdatePackage>, _columnId: string, value: string) =>
		!value || (value === "security") === row.original.security,
};
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Updates"
				icon="i-lucide-package-check"
				description="Host VM packages and Zitadel releases"
			>
				<template #right>
					<UButton
						label="Check Now"
						icon="i-lucide-refresh-cw"
						color="neutral"
						variant="outline"
						:loading="checking"
						@click="checkNow"
					/>
				</template>
			</DashboardPageHeader>
		</template>

		<template #body>
			<DashboardPageBody>
				<div v-if="!status.data.value" class="flex justify-center py-12">
					<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
				</div>

				<template v-else>
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						<DashboardStatCard
							label="Pending updates"
							:value="os?.supported ? (os?.packages.length ?? 0) : '-'"
							:hint="os?.checkedAt ? `checked ${formatRelative(os.checkedAt)}` : 'never checked'"
							icon="i-lucide-package"
							icon-class="text-primary-400"
						/>
						<DashboardStatCard
							label="Security updates"
							:value="os?.supported ? securityCount : '-'"
							icon="i-lucide-shield-alert"
							:icon-class="securityCount > 0 ? 'text-red-400' : 'text-emerald-400'"
						/>
						<DashboardStatCard
							label="Reboot"
							:value="os?.rebootRequired ? 'Required' : 'Not required'"
							:hint="os?.rebootPackages.length ? os.rebootPackages.join(', ') : undefined"
							icon="i-lucide-rotate-ccw"
							:icon-class="os?.rebootRequired ? 'text-amber-400' : 'text-emerald-400'"
						/>
						<DashboardStatCard
							label="Latest Zitadel"
							:value="zitadel?.latestVersion ?? '-'"
							:hint="zitadel?.latestPublishedAt ? `released ${formatRelative(zitadel.latestPublishedAt)}` : undefined"
							icon="i-lucide-tag"
							icon-class="text-amber-400"
						/>
					</div>

					<!-- OS packages -->
					<UAlert
						v-if="os && !os.supported"
						color="neutral"
						variant="subtle"
						icon="i-lucide-info"
						title="Package updates are not available on this host"
						:description="`${os.reason ?? ''} In Docker, mount the host's / read-only (e.g. /:/host:ro) and set LAVIAC_HOST_ROOT=/host.`"
					/>
					<UAlert
						v-if="os?.error"
						color="error"
						variant="subtle"
						icon="i-lucide-alert-circle"
						title="The last package check failed"
						:description="os.error"
					/>

					<template v-if="os?.supported">
						<p class="text-sm text-slate-400">
							Package lists last refreshed on the host
							<span class="text-slate-200">{{ formatRelative(os.listsUpdatedAt) }}</span>.
							LAVIAC reads them without changing anything — run <code class="text-slate-200">apt update</code>
							on the host (or let apt-daily do it) to see newer releases.
						</p>

						<DashboardDataTable
							:data="os.packages"
							:columns="columns"
							:loading="checking"
							:show-refresh="false"
							:default-page-size="25"
							:filters="[
								{ column: 'name', type: 'text', placeholder: 'Search packages...', icon: 'i-lucide-search' },
								typeFilter,
							]"
							empty-title="The host is up to date"
							empty-description="No upgradable packages in the host's package lists."
							empty-icon="i-lucide-circle-check"
						>
							<template #name-cell="{ row }">
								<span class="font-medium text-white">{{ row.original.name }}</span>
							</template>

							<template #currentVersion-cell="{ row }">
								<span class="font-mono text-xs text-slate-400">{{ row.original.currentVersion }}</span>
							</template>

							<template #candidateVersion-cell="{ row }">
								<span class="font-mono text-xs text-slate-200">{{ row.original.candidateVersion }}</span>
							</template>

							<template #origin-cell="{ row }">
								<span class="text-sm text-slate-400">{{ row.original.origin }}</span>
							</template>

							<template #security-cell="{ row }">
								<UBadge
									v-if="row.original.security"
									color="error"
									variant="soft"
									icon="i-lucide-shield-alert"
									label="Security"
								/>
								<UBadge v-else color="neutral" variant="soft" label="Regular" />
							</template>
						</DashboardDataTable>
					</template>

					<!-- Zitadel -->
					<DashboardSectionCard
						title="Zitadel"
						:description="zitadel?.checkedAt ? `Latest release checked ${formatRelative(zitadel.checkedAt)}` : 'Release check pending'"
						icon="i-lucide-shield-check"
					>
						<template #actions>
							<UButton
								v-if="zitadel?.latestUrl"
								label="Release notes"
								:to="zitadel.latestUrl"
								target="_blank"
								color="neutral"
								variant="ghost"
								trailing-icon="i-lucide-external-link"
							/>
						</template>

						<div class="space-y-4">
							<div class="flex flex-wrap items-center gap-3 text-sm">
								<span class="text-slate-400">Latest release:</span>
								<span class="font-mono text-white">{{ zitadel?.latestVersion ?? "unknown" }}</span>
								<UBadge
									v-if="zitadel?.updateAvailable === true"
									color="warning"
									variant="soft"
									icon="i-lucide-arrow-up-circle"
									label="Update available"
								/>
								<UBadge
									v-else-if="zitadel?.updateAvailable === false"
									color="success"
									variant="soft"
									icon="i-lucide-circle-check"
									label="Up to date"
								/>
							</div>

							<p v-if="zitadel?.error" class="text-sm text-slate-400">
								<UIcon name="i-lucide-alert-triangle" class="text-amber-400" />
								Release check failed: {{ zitadel.error }}
							</p>

							<div>
								<h4 class="mb-2 text-sm font-medium text-slate-300">Versions reported by the instances</h4>
								<ul v-if="zitadel?.instanceVersions.length" class="divide-y divide-slate-800 text-sm">
									<li
										v-for="version in zitadel.instanceVersions"
										:key="version.version"
										class="flex items-center justify-between py-2"
									>
										<span class="font-mono text-slate-200">{{ version.version }}</span>
										<span class="text-slate-400">
											{{ version.count }} {{ version.count === 1 ? "instance" : "instances" }}
										</span>
									</li>
								</ul>
								<p v-else class="text-sm text-slate-500">No instance reported a version.</p>
							</div>
						</div>
					</DashboardSectionCard>
				</template>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
