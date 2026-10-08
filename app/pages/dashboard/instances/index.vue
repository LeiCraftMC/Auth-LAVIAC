<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { InstanceListItem, InstanceTemplates } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Instances | LAVIAC",
	description: "Zitadel virtual instances managed via the System API",
});

const toast = useToast();

const columns: TableColumn<InstanceListItem>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "id", header: "ID" },
	{ accessorKey: "state", header: "State" },
	{ accessorKey: "template", header: "Template" },
	{ id: "domain", header: "Primary domain" },
	{ accessorKey: "version", header: "Version" },
	{ accessorKey: "createdAt", header: "Created" },
	{ id: "actions", header: "" },
];

const instances = await useAPIAsyncData<InstanceListItem[]>("instances", async () => {
	const res = await useAPI((api) => api.getInstances({}));
	if (!res.success) {
		toast.add({ title: "Failed to load instances", description: res.message, color: "error" });
		return [];
	}
	return res.data;
});

const templates = await useAPILazyAsyncData<InstanceTemplates | null>(
	"instance-templates",
	async () => {
		const res = await useAPI((api) => api.getInstanceTemplates({}));
		return res.success ? res.data : null;
	},
);

const templateNames = computed(
	() => new Map(templates.data.value?.templates.map((t) => [t.id, t.name]) ?? []),
);

const deleteConfirmOpen = ref(false);
const deleteTarget = ref<InstanceListItem | null>(null);

function openDelete(instance: InstanceListItem) {
	deleteTarget.value = instance;
	deleteConfirmOpen.value = true;
}

async function onDeleteInstance() {
	const target = deleteTarget.value;
	if (!target) return;

	const res = await useAPI((api) =>
		api.deleteInstancesByInstanceId({ path: { instanceId: target.id } }),
	);
	if (!res.success) {
		toast.add({
			title: "Failed to delete instance",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		throw new Error(res.message);
	}

	toast.add({ title: "Instance deleted", description: target.name, color: "success" });
	await instances.refresh();
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Instances"
				icon="i-lucide-server"
				description="Zitadel virtual instances"
			/>
		</template>

		<template #body>
			<DashboardPageBody>
				<DashboardDataTable
					:data="instances.data"
					:columns="columns"
					:loading="instances.loading"
					:filters="[
						{
							column: 'name',
							type: 'text',
							placeholder: 'Search instances...',
							icon: 'i-lucide-search',
						},
						{
							column: 'state',
							type: 'select',
							placeholder: 'All states',
							options: INSTANCE_STATE_OPTIONS,
						},
					]"
					empty-title="No instances"
					empty-description="Create the first virtual instance to get started."
					empty-icon="i-lucide-server"
					@refresh="instances.refresh()"
				>
					<template #header-right>
						<UButton
							label="New Instance"
							icon="i-lucide-plus"
							color="primary"
							to="/dashboard/instances/new"
						/>
					</template>

					<template #name-cell="{ row }">
						<NuxtLink
							:to="`/dashboard/instances/${row.original.id}`"
							class="font-medium text-primary hover:underline"
						>
							{{ row.original.name }}
						</NuxtLink>
					</template>

					<template #id-cell="{ row }">
						<span class="font-mono text-xs text-slate-400">{{ row.original.id }}</span>
					</template>

					<template #state-cell="{ row }">
						<InstanceStateBadge :state="row.original.state" />
					</template>

					<template #template-cell="{ row }">
						<span v-if="row.original.template" class="text-sm text-slate-300">
							{{ templateNames.get(row.original.template) ?? row.original.template }}
						</span>
						<span v-else class="text-sm text-slate-500" title="Created before templates">—</span>
					</template>

					<template #domain-cell="{ row }">
						<span class="text-slate-300">{{ getPrimaryDomain(row.original) ?? "—" }}</span>
					</template>

					<template #version-cell="{ row }">
						<span class="text-sm text-slate-400">{{ row.original.version || "—" }}</span>
					</template>

					<template #createdAt-cell="{ row }">
						<span class="text-sm">{{ formatDate(row.original.createdAt) }}</span>
					</template>

					<template #actions-cell="{ row }">
						<UButton
							icon="i-lucide-trash"
							color="error"
							variant="ghost"
							size="sm"
							aria-label="Delete instance"
							@click="openDelete(row.original)"
						/>
					</template>

					<template #empty-actions>
						<UButton label="Create Instance" color="primary" to="/dashboard/instances/new" />
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>

	<DashboardDeleteModal
		v-model:open="deleteConfirmOpen"
		title="Delete Instance"
		:warning-text="`This permanently deletes the Zitadel instance “${deleteTarget?.name ?? ''}” including its orgs, users and configuration. This action cannot be undone.`"
		:on-delete="onDeleteInstance"
	/>
</template>
