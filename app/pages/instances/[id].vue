<script setup lang="ts">
import type { Instance } from "~/types";
import { primaryDomain } from "~/types";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const id = route.params.id as string;

useSeoMeta({ title: "Instance — LAVIAC" });

const { data, pending, refresh } = await useLazyAsyncData<{
	instance: Instance | null;
	error: string;
}>(`instance-${id}`, async () => {
	const result = await useAPI((api) => api.getInstance({ path: { id } }));
	if (!result.success) return { instance: null, error: result.message };
	return { instance: result.data as Instance, error: "" };
});

// rename
const renaming = ref(false);
const renameValue = ref("");
const renameSaving = ref(false);

function startRename() {
	renameValue.value = data.value?.instance?.name ?? "";
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

    <div v-if="data?.error" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ data.error }}
    </div>

    <template v-if="data?.instance">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div>
            <div v-if="!renaming" class="flex items-center gap-2">
              <h1 class="text-xl font-semibold text-white">{{ data.instance.name }}</h1>
              <UButton icon="i-lucide-pencil" size="sm" variant="ghost" color="neutral" @click="startRename" />
            </div>
            <div v-else class="flex items-center gap-2">
              <UInput v-model="renameValue" />
              <UButton size="sm" :loading="renameSaving" @click="saveRename">Save</UButton>
              <UButton size="sm" variant="ghost" color="neutral" @click="renaming = false">Cancel</UButton>
            </div>
          </div>
          <DashboardStateBadge :state="data.instance.state" />
        </div>
        <UButton icon="i-lucide-trash-2" color="error" variant="soft" @click="remove">Delete instance</UButton>
      </div>

      <UCard>
        <template #header><span class="font-medium">Overview</span></template>
        <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-slate-500">ID</dt>
            <dd class="font-mono text-xs text-slate-300">{{ data.instance.id }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Version</dt>
            <dd class="text-slate-300">{{ data.instance.version ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Primary domain</dt>
            <dd class="text-slate-300">{{ primaryDomain(data.instance) ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Created</dt>
            <dd class="text-slate-300">{{ data.instance.createdAt ? new Date(data.instance.createdAt).toLocaleString() : "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Changed</dt>
            <dd class="text-slate-300">{{ data.instance.changedAt ? new Date(data.instance.changedAt).toLocaleString() : "—" }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Domains</dt>
            <dd class="text-slate-300">{{ data.instance.domains?.length ?? 0 }}</dd>
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

    <div v-else-if="pending" class="text-slate-500">Loading instance…</div>
  </div>
</template>