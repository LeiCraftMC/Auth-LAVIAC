<script setup lang="ts">
import type { Instance } from "~/utils/types";
import { primaryDomain } from "~/utils/types";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const id = route.params.id as string;

useSeoMeta({ title: "Instance — LAVIAC" });

const loadError = ref("");

const { data, loading, refresh } = await useAPILazyAsyncData<Instance | null>(
	`instance-${id}`,
	async () => {
		const result = await useAPI((api) => api.getInstancesById({ path: { id } }));
		if (!result.success) {
			loadError.value = result.message;
			return null;
		}
		loadError.value = "";
		return result.data;
	},
);

// rename
const renaming = ref(false);
const renameValue = ref("");
const renameSaving = ref(false);

function startRename() {
	renameValue.value = data.value?.name ?? "";
	renaming.value = true;
}

async function saveRename() {
	renameSaving.value = true;
	const result = await useAPI((api) =>
		api.updateInstance({ path: { id }, body: { instanceName: renameValue.value } }),
	);
	renameSaving.value = false;
	if (!result.success) {
		toast.add({ title: "Rename failed", description: result.message, color: "error" });
		return;
	}
	renaming.value = false;
	await refresh();
	toast.add({ title: "Instance renamed", color: "success" });
}

async function remove() {
	const result = await useAPI((api) => api.deleteInstance({ path: { id } }));
	if (!result.success) {
		toast.add({ title: "Delete failed", description: result.message, color: "error" });
		return;
	}
	toast.add({ title: "Instance deleted", color: "success" });
	await router.push("/instances");
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/instances" class="mb-1">
      Instances
    </UButton>

    <div v-if="loadError" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ loadError }}
    </div>

    <template v-if="data">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div>
            <div v-if="!renaming" class="flex items-center gap-2">
              <h1 class="text-xl font-semibold text-white">{{ data.name }}</h1>
              <UButton icon="i-lucide-pencil" size="sm" variant="ghost" color="neutral" @click="startRename" />
            </div>
            <div v-else class="flex items-center gap-2">
              <UInput v-model="renameValue" />
              <UButton size="sm" :loading="renameSaving" @click="saveRename">Save</UButton>
              <UButton size="sm" variant="ghost" color="neutral" @click="renaming = false">Cancel</UButton>
            </div>
          </div>
          <DashboardStateBadge :state="data.state" />
        </div>
        <UButton icon="i-lucide-trash-2" color="error" variant="soft" @click="remove">Delete instance</UButton>
      </div>

      <UCard>
        <template #header><span class="font-medium">Overview</span></template>
        <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-slate-500">ID</dt>
            <dd class="font-mono text-xs text-slate-300">{{ data.id }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Version</dt>
            <dd class="text-slate-300">{{ data.version ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Primary domain</dt>
            <dd class="text-slate-300">{{ primaryDomain(data) ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Created</dt>
            <dd class="text-slate-300">{{ data.createdAt ? new Date(data.createdAt).toLocaleString() : "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Changed</dt>
            <dd class="text-slate-300">{{ data.changedAt ? new Date(data.changedAt).toLocaleString() : "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Domains</dt>
            <dd class="text-slate-300">{{ data.domains?.length ?? 0 }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2"><UIcon name="i-lucide-globe" /><span class="font-medium">Domains</span></div>
        </template>
        <DashboardDomainList :instance-id="id" @changed="refresh" />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2"><UIcon name="i-lucide-gauge" /><span class="font-medium">Limits</span></div>
        </template>
        <DashboardLimitsEditor :instance-id="id" />
      </UCard>
    </template>

    <div v-else-if="loading" class="text-slate-500">Loading instance…</div>
  </div>
</template>