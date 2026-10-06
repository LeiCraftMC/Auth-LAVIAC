<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import { zPutInstancesByInstanceIdBody } from "~/api-client/zod.gen";
import type { Instance } from "~/utils/types";

const toast = useToast();

const instance = useSubrouterInjectedData<Instance>("instance").inject();

// Referenced here (not only in the template) so Biome keeps it a value import.
const renameSchema = zPutInstancesByInstanceIdBody;
type RenameSchema = z.output<typeof renameSchema>;

const renameState = reactive<RenameSchema>({ instanceName: instance.data.value.name });
const renaming = ref(false);

async function onRename(event: FormSubmitEvent<RenameSchema>) {
	renaming.value = true;
	const result = await useAPI((api) =>
		api.putInstancesByInstanceId({
			path: { instanceId: instance.data.value.id },
			body: { instanceName: event.data.instanceName },
		}),
	);
	renaming.value = false;

	if (!result.success) {
		toast.add({
			title: "Failed to rename instance",
			description: result.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({ title: "Instance renamed", icon: "i-lucide-check", color: "success" });
	await instance.refresh();
}

const details = computed(() => [
	{ label: "ID", value: instance.data.value.id, mono: true },
	{ label: "Version", value: instance.data.value.version || "—" },
	{ label: "Primary domain", value: getPrimaryDomain(instance.data.value) ?? "—" },
	{ label: "Domains", value: String(instance.data.value.domains?.length ?? 0) },
	{ label: "Created", value: formatDate(instance.data.value.createdAt) },
	{ label: "Last changed", value: formatDate(instance.data.value.changedAt) },
]);

const deleteConfirmOpen = ref(false);

async function onDeleteInstance() {
	const res = await useAPI((api) =>
		api.deleteInstancesByInstanceId({ path: { instanceId: instance.data.value.id } }),
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

	toast.add({ title: "Instance deleted", color: "success" });
	await navigateTo("/dashboard/instances");
}
</script>

<template>
	<div class="mx-auto w-full space-y-6 lg:w-3xl">
		<div>
			<h2 class="text-xl font-semibold text-white">{{ instance.data.value.name }}</h2>
			<p class="mt-1 text-sm text-slate-400">View and manage this virtual instance.</p>
		</div>

		<DashboardSectionCard title="Instance Information" description="As reported by the Zitadel System API" icon="i-lucide-info">
			<dl class="grid gap-4 text-sm sm:grid-cols-2">
				<div v-for="detail in details" :key="detail.label">
					<dt class="text-slate-500">{{ detail.label }}</dt>
					<dd :class="['mt-0.5 text-slate-200', detail.mono ? 'font-mono text-xs' : '']">
						{{ detail.value }}
					</dd>
				</div>
			</dl>
		</DashboardSectionCard>

		<DashboardSectionCard title="Rename" description="Only the name is mutable via the System API" icon="i-lucide-pencil">
			<UForm
				:schema="renameSchema"
				:state="renameState"
				class="divide-y divide-slate-800"
				@submit="onRename"
			>
				<UFormField
					name="instanceName"
					label="Instance name"
					description="Shown in the console and the instance list."
					required
					class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col"
					:ui="{ root: 'w-full sm:w-auto', container: 'w-full sm:w-auto' }"
				>
					<UInput v-model="renameState.instanceName" class="w-full sm:w-80" />
				</UFormField>

				<div class="pt-4">
					<UButton label="Save Changes" type="submit" :loading="renaming" icon="i-lucide-save" />
				</div>
			</UForm>
		</DashboardSectionCard>

		<DashboardSectionCard
			title="Danger Zone"
			description="Irreversible and destructive actions"
			icon="i-lucide-alert-triangle"
			tone="danger"
		>
			<div class="flex flex-col gap-4 md:flex-row md:items-center">
				<div class="flex-1">
					<h4 class="font-medium text-white">Delete Instance</h4>
					<p class="mt-1 text-sm text-slate-400">
						Removes the instance with all its organizations, users and settings.
					</p>
				</div>
				<UButton
					label="Delete Instance"
					color="error"
					variant="soft"
					icon="i-lucide-trash-2"
					@click="deleteConfirmOpen = true"
				/>
			</div>
		</DashboardSectionCard>

		<DashboardDeleteModal
			v-model:open="deleteConfirmOpen"
			title="Delete Instance"
			:warning-text="`This permanently deletes the Zitadel instance “${instance.data.value.name}” including its orgs, users and configuration. This action cannot be undone.`"
			:on-delete="onDeleteInstance"
		/>
	</div>
</template>
