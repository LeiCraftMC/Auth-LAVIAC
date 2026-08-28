<script setup lang="ts">
const props = defineProps<{ instanceId: string }>();

const toast = useToast();
const auditLogRetention = ref("");
const block = ref<null | boolean>(null);
const saving = ref(false);

const blockOptions = [
	{ label: "Unchanged", value: null },
	{ label: "Active (running)", value: false },
	{ label: "Blocked", value: true },
];

async function save() {
	saving.value = true;
	const result = await useAPI((api) =>
		api.setInstanceLimits({
			path: { instanceId: props.instanceId },
			body: {
				auditLogRetention: auditLogRetention.value || undefined,
				block: block.value,
			},
		}),
	);
	saving.value = false;
	if (!result.success) {
		toast.add({ title: "Save failed", description: result.message, color: "error" });
		return;
	}
	toast.add({ title: "Limits updated", color: "success" });
}

async function reset() {
	const result = await useAPI((api) =>
		api.resetInstanceLimits({ path: { instanceId: props.instanceId } }),
	);
	if (!result.success) {
		toast.add({ title: "Reset failed", description: result.message, color: "error" });
		return;
	}
	auditLogRetention.value = "";
	block.value = null;
	toast.add({ title: "Limits reset", color: "success" });
}
</script>

<template>
  <div class="space-y-4">
    <UFormField label="Audit log retention" help="A protobuf duration, e.g. 720h (720 hours).">
      <UInput v-model="auditLogRetention" placeholder="720h" icon="i-lucide-clock" />
    </UFormField>

    <UFormField label="Instance access">
      <USelect v-model="block" :items="blockOptions" />
    </UFormField>

    <div class="flex justify-between">
      <UButton color="error" variant="ghost" icon="i-lucide-rotate-ccw" @click="reset">Reset to defaults</UButton>
      <UButton icon="i-lucide-save" :loading="saving" @click="save">Save limits</UButton>
    </div>
  </div>
</template>