<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Task, TaskDetail } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Tasks | LAVIAC",
	description: "Background tasks and their logs",
});

const toast = useToast();
const route = useRoute();
const router = useRouter();

const tasks = await useAPIAsyncData<Task[]>("admin-tasks", async () => {
	const res = await useAPI((api) => api.getAdminTasks({}));
	if (!res.success) {
		toast.add({ title: "Failed to load tasks", description: res.message, color: "error" });
		return [];
	}
	return res.data;
});

const TASK_STATUS: Record<
	string,
	{ label: string; color: "success" | "error" | "info" | "warning" | "neutral"; icon: string }
> = {
	pending: { label: "Queued", color: "info", icon: "i-lucide-clock" },
	running: { label: "Running", color: "info", icon: "i-lucide-loader" },
	paused: { label: "Paused", color: "warning", icon: "i-lucide-pause" },
	completed: { label: "Completed", color: "success", icon: "i-lucide-check" },
	failed: { label: "Failed", color: "error", icon: "i-lucide-x" },
};

const TASK_NAMES: Record<string, string> = {
	applyDefaultBranding: "Apply default branding",
};

const statusOptions = Object.entries(TASK_STATUS).map(([value, status]) => ({
	label: status.label,
	value,
}));

const columns: TableColumn<Task>[] = [
	{ accessorKey: "id", header: "#" },
	{ accessorKey: "function", header: "Task" },
	{ accessorKey: "status", header: "Status" },
	{ accessorKey: "created_by_user_sub", header: "Started by" },
	{ accessorKey: "created_at", header: "Created" },
	{ accessorKey: "finished_at", header: "Finished" },
	{ id: "actions", header: "" },
];

// Detail dialog — `?task=<id>` opens it directly (linked from the instance branding page).
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<TaskDetail | null>(null);

async function openTask(taskId: number) {
	detail.value = null;
	detailOpen.value = true;
	detailLoading.value = true;
	const res = await useAPI((api) => api.getAdminTasksByTaskId({ path: { taskId } }));
	detailLoading.value = false;

	if (!res.success) {
		detailOpen.value = false;
		toast.add({ title: "Failed to load the task", description: res.message, color: "error" });
		return;
	}
	detail.value = res.data;
}

watch(detailOpen, (open) => {
	if (!open && route.query.task) router.replace({ query: {} });
});

onMounted(() => {
	const taskId = Number(route.query.task);
	if (Number.isInteger(taskId) && taskId > 0) openTask(taskId);
});
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Tasks"
				icon="i-lucide-list-checks"
				description="Background work such as applying the default branding"
			/>
		</template>

		<template #body>
			<DashboardPageBody>
				<DashboardDataTable
					:data="tasks.data"
					:columns="columns"
					:loading="tasks.loading"
					:filters="[
						{ column: 'status', type: 'select', placeholder: 'All statuses', options: statusOptions },
					]"
					empty-title="No tasks"
					empty-description="Creating an instance queues its default-branding task."
					empty-icon="i-lucide-list-checks"
					@refresh="tasks.refresh()"
				>
					<template #id-cell="{ row }">
						<span class="font-mono text-xs text-slate-400">#{{ row.original.id }}</span>
					</template>

					<template #function-cell="{ row }">
						<div class="min-w-0">
							<p class="font-medium text-white">{{ TASK_NAMES[row.original.function] ?? row.original.function }}</p>
							<p v-if="row.original.args.instanceId" class="font-mono text-xs text-slate-500">
								instance {{ row.original.args.instanceId }}
							</p>
						</div>
					</template>

					<template #status-cell="{ row }">
						<UBadge
							:color="TASK_STATUS[row.original.status]?.color ?? 'neutral'"
							:icon="TASK_STATUS[row.original.status]?.icon"
							variant="soft"
							:label="TASK_STATUS[row.original.status]?.label ?? row.original.status"
						/>
					</template>

					<template #created_by_user_sub-cell="{ row }">
						<span class="text-sm text-slate-300">{{ row.original.created_by_user_sub ?? "system" }}</span>
					</template>

					<template #created_at-cell="{ row }">
						<span class="text-sm whitespace-nowrap">{{ formatDate(row.original.created_at) }}</span>
					</template>

					<template #finished_at-cell="{ row }">
						<span class="text-sm whitespace-nowrap">{{ formatDate(row.original.finished_at) }}</span>
					</template>

					<template #actions-cell="{ row }">
						<UButton
							label="Details"
							icon="i-lucide-file-text"
							color="neutral"
							variant="ghost"
							size="sm"
							@click="openTask(row.original.id)"
						/>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>

	<DashboardModal
		v-model:open="detailOpen"
		:title="detail ? `Task #${detail.id}` : 'Task'"
		:description="detail ? (TASK_NAMES[detail.function] ?? detail.function) : undefined"
		icon="i-lucide-list-checks"
		:loading="detailLoading"
		:ui="{ content: 'sm:max-w-3xl' }"
	>
		<div v-if="detail" class="space-y-4">
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<UBadge
					:color="TASK_STATUS[detail.status]?.color ?? 'neutral'"
					:icon="TASK_STATUS[detail.status]?.icon"
					variant="soft"
					:label="TASK_STATUS[detail.status]?.label ?? detail.status"
				/>
				<span class="text-slate-400">started {{ formatDate(detail.created_at) }}</span>
				<span v-if="detail.finished_at" class="text-slate-400">· finished {{ formatDate(detail.finished_at) }}</span>
			</div>

			<p v-if="detail.message" class="text-sm text-slate-300">{{ detail.message }}</p>

			<div>
				<h4 class="mb-2 text-sm font-medium text-slate-300">Log</h4>
				<pre
					v-if="detail.logs"
					class="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-300"
				>{{ detail.logs }}</pre>
				<p v-else class="text-sm text-slate-500">This task has no stored log.</p>
			</div>
		</div>

		<template #footer>
			<UButton label="Close" color="neutral" variant="outline" @click="detailOpen = false" />
		</template>
	</DashboardModal>
</template>
