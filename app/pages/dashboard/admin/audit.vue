<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AuditEntry } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Audit Log | LAVIAC",
	description: "Every action taken in LAVIAC",
});

const toast = useToast();
const route = useRoute();

// `?action=` (e.g. from the statistics page) narrows the query server-side.
const actionFilter = computed(() => route.query.action?.toString() || undefined);

const audit = await useAPIAsyncData<{ total: number; items: AuditEntry[] }>(
	"admin-audit",
	async () => {
		const res = await useAPI((api) =>
			api.getAdminAudit({ query: { limit: 1000, action: actionFilter.value } }),
		);
		if (!res.success) {
			toast.add({ title: "Failed to load the audit log", description: res.message, color: "error" });
			return { total: 0, items: [] };
		}
		return res.data;
	},
);

watch(actionFilter, () => audit.refresh());

const items = computed(() => audit.data.value?.items ?? []);

const actionOptions = computed(() =>
	[...new Set(items.value.map((entry) => entry.action))].sort().map((action) => ({
		label: action,
		value: action,
	})),
);

const columns: TableColumn<AuditEntry>[] = [
	{ accessorKey: "created_at", header: "Time" },
	{ accessorKey: "actor_sub", header: "Actor" },
	{ accessorKey: "action", header: "Action" },
	{ accessorKey: "target_instance_id", header: "Instance" },
	{ accessorKey: "detail", header: "Detail" },
];

function actionColor(action: string) {
	if (action.endsWith(".delete") || action.endsWith(".remove") || action.endsWith(".revoke")) {
		return "error";
	}
	if (action.startsWith("auth.")) return "neutral";
	return "primary";
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Audit Log"
				icon="i-lucide-scroll-text"
				description="Every action taken in LAVIAC"
			/>
		</template>

		<template #body>
			<DashboardPageBody>
				<div v-if="actionFilter" class="flex items-center gap-2 text-sm text-slate-400">
					Showing only
					<UBadge color="primary" variant="soft" class="font-mono">{{ actionFilter }}</UBadge>
					<UButton
						label="Show all"
						size="xs"
						color="neutral"
						variant="ghost"
						icon="i-lucide-x"
						to="/dashboard/admin/audit"
					/>
				</div>

				<DashboardDataTable
					:data="items"
					:columns="columns"
					:loading="audit.loading"
					:default-page-size="25"
					:filters="[
						{ column: 'actor_sub', type: 'text', placeholder: 'Search actor...', icon: 'i-lucide-search' },
						{ column: 'action', type: 'select', placeholder: 'All actions', options: actionOptions },
						{ column: 'created_at', type: 'date', placeholder: 'Any time' },
					]"
					empty-title="No audit entries"
					empty-description="Actions such as logins and instance changes show up here."
					empty-icon="i-lucide-scroll-text"
					@refresh="audit.refresh()"
				>
					<template #header-right>
						<span v-if="audit.data.value && audit.data.value.total > items.length" class="text-xs text-slate-500">
							Latest {{ items.length }} of {{ audit.data.value.total }}
						</span>
					</template>

					<template #created_at-cell="{ row }">
						<span class="text-sm whitespace-nowrap">{{ formatDate(row.original.created_at) }}</span>
					</template>

					<template #actor_sub-cell="{ row }">
						<span class="text-slate-200">{{ row.original.actor_sub }}</span>
					</template>

					<template #action-cell="{ row }">
						<UBadge :color="actionColor(row.original.action)" variant="soft" class="font-mono">
							{{ row.original.action }}
						</UBadge>
					</template>

					<template #target_instance_id-cell="{ row }">
						<NuxtLink
							v-if="row.original.target_instance_id"
							:to="`/dashboard/instances/${row.original.target_instance_id}`"
							class="font-mono text-xs text-primary hover:underline"
						>
							{{ row.original.target_instance_id }}
						</NuxtLink>
						<span v-else class="text-slate-500">—</span>
					</template>

					<template #detail-cell="{ row }">
						<span class="line-clamp-1 max-w-xs text-sm text-slate-400">{{ row.original.detail || "—" }}</span>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
