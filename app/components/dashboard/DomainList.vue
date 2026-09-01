<script setup lang="ts">
import type { InstanceDomain } from "~/utils/types";

const props = defineProps<{ instanceId: string }>();
const emit = defineEmits<(e: "changed") => void>();

const toast = useToast();
const newDomain = ref("");
const loadError = ref("");

const { data, loading, refresh } = await useAPILazyAsyncData<InstanceDomain[] | null>(
	`domains-${props.instanceId}`,
	async () => {
		const result = await useAPI((api) =>
			api.getInstancesByInstanceIdDomains({ path: { instanceId: props.instanceId } }),
		);
		if (!result.success) {
			loadError.value = result.message;
			return null;
		}
		loadError.value = "";
		return result.data;
	},
);

async function add() {
	if (!newDomain.value) return;
	const result = await useAPI((api) =>
		api.postInstancesByInstanceIdDomains({
			path: { instanceId: props.instanceId },
			body: { domain: newDomain.value },
		}),
	);
	if (!result.success) {
		toast.add({ title: "Add failed", description: result.message, color: "error" });
		return;
	}
	newDomain.value = "";
	await refresh();
	emit("changed");
}

async function setPrimary(domain: string) {
	const result = await useAPI((api) =>
		api.postInstancesByInstanceIdDomainsSetPrimary({ path: { instanceId: props.instanceId }, body: { domain } }),
	);
	if (!result.success) {
		toast.add({ title: "Failed", description: result.message, color: "error" });
		return;
	}
	await refresh();
}

async function remove(domain: string) {
	const result = await useAPI((api) =>
		api.deleteInstancesByInstanceIdDomainsByDomain({ path: { instanceId: props.instanceId, domain } }),
	);
	if (!result.success) {
		toast.add({ title: "Remove failed", description: result.message, color: "error" });
		return;
	}
	await refresh();
	emit("changed");
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-2">
      <UInput v-model="newDomain" placeholder="new.example.com" icon="i-lucide-globe" class="flex-1" />
      <UButton icon="i-lucide-plus" @click="add">Add</UButton>
    </div>

    <div v-if="loadError" class="text-sm text-red-400">{{ loadError }}</div>

    <ul class="divide-y divide-slate-800 rounded-md border border-slate-800">
      <li v-for="d in data ?? []" :key="d.domain" class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-globe" class="text-slate-500" />
          <span class="text-slate-200">{{ d.domain }}</span>
          <UBadge v-if="d.primary" color="primary" variant="subtle" label="primary" />
          <UBadge v-else-if="d.generated" color="neutral" variant="subtle" label="generated" />
        </div>
        <div class="flex gap-1">
          <UButton v-if="!d.primary" size="sm" variant="ghost" color="neutral" @click="setPrimary(d.domain)">
            Set primary
          </UButton>
          <UButton v-if="!d.generated" size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(d.domain)" />
        </div>
      </li>
      <li v-if="!data?.length && !loading" class="px-3 py-6 text-center text-sm text-slate-500">
        No domains.
      </li>
    </ul>
  </div>
</template>