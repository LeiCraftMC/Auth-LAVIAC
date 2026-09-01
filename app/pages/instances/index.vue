<script setup lang="ts">
import type { Instance } from "~/utils/types";
import { primaryDomain } from "~/utils/types";

useSeoMeta({ title: "Instances — LAVIAC" });

const toast = useToast();
const loadError = ref("");

const { data, loading, refresh } = await useAPILazyAsyncData<Instance[] | null>(
	"instances-list",
	async () => {
		const result = await useAPI((api) => api.getInstances({}));
		if (!result.success) {
			loadError.value = result.message;
			return null;
		}
		loadError.value = "";
		return result.data;
	},
);

async function deleteInstance(instance: Instance) {
	const result = await useAPI((api) => api.deleteInstancesById({ path: { id: instance.id } }));
	if (!result.success) {
		toast.add({ title: "Delete failed", description: result.message, color: "error" });
		return;
	}
	toast.add({ title: "Instance deleted", description: instance.name, color: "success" });
	await refresh();
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-white">Virtual instances</h1>
        <p class="text-sm text-slate-400">Zitadel instances managed via the System API.</p>
      </div>
      <div class="flex gap-2">
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="refresh">
          Refresh
        </UButton>
        <UButton icon="i-lucide-plus" to="/instances/create">New instance</UButton>
      </div>
    </div>

    <div v-if="loadError" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ loadError }}
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <table class="w-full text-sm">
        <thead class="text-left text-slate-400">
          <tr class="border-b border-slate-800">
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">ID</th>
            <th class="px-4 py-3 font-medium">State</th>
            <th class="px-4 py-3 font-medium">Primary domain</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="inst in data ?? []" :key="inst.id" class="border-b border-slate-800/60 hover:bg-slate-900/40">
            <td class="px-4 py-3">
              <NuxtLink :to="`/instances/${inst.id}`" class="font-medium text-white hover:text-sky-300">
                {{ inst.name }}
              </NuxtLink>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-500">{{ inst.id }}</td>
            <td class="px-4 py-3"><DashboardStateBadge :state="inst.state" /></td>
            <td class="px-4 py-3 text-slate-300">{{ primaryDomain(inst) ?? "—" }}</td>
            <td class="px-4 py-3 text-slate-400">{{ inst.createdAt ? new Date(inst.createdAt).toLocaleDateString() : "—" }}</td>
            <td class="px-4 py-3 text-right">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                @click="deleteInstance(inst)"
              />
            </td>
          </tr>
          <tr v-if="!data?.length && !loading">
            <td colspan="6" class="px-4 py-10 text-center text-slate-500">No instances found.</td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>