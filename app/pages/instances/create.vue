<script setup lang="ts">
import type { CreateInstanceBody, CreateInstanceResult } from "~/utils/types";

useSeoMeta({ title: "Create instance — LAVIAC" });

const toast = useToast();
const router = useRouter();

const ownerType = ref<"human" | "machine">("human");

const instanceName = ref("");
const firstOrgName = ref("");
const customDomain = ref("");
const defaultLanguage = ref("en");

// human owner
const humanUserName = ref("");
const humanEmail = ref("");
const humanFirstName = ref("");
const humanLastName = ref("");
const humanPassword = ref("");

// machine owner
const machineUserName = ref("");
const machineName = ref("");

const submitting = ref(false);

async function submit() {
	if (!instanceName.value) return;

	const body: CreateInstanceBody = {
		instanceName: instanceName.value,
		firstOrgName: firstOrgName.value || undefined,
		customDomain: customDomain.value || undefined,
		defaultLanguage: defaultLanguage.value || undefined,
	};

	if (ownerType.value === "human") {
		body.human = {
			userName: humanUserName.value,
			email: { email: humanEmail.value },
			profile: { firstName: humanFirstName.value, lastName: humanLastName.value },
			password: { password: humanPassword.value },
		};
	} else {
		body.machine = {
			userName: machineUserName.value,
			name: machineName.value,
		};
	}

	submitting.value = true;
	const result = await useAPI((api) => api.postInstances({ body }));
	submitting.value = false;

	if (!result.success) {
		toast.add({ title: "Create failed", description: result.message, color: "error" });
		return;
	}

	const data = result.data as CreateInstanceResult;
	toast.add({ title: "Instance created", description: `ID ${data.instanceId}`, color: "success" });
	if (data.pat) {
		toast.add({ title: "Owner PAT", description: data.pat, color: "warning", timeout: 0 });
	}
	await router.push(`/instances/${data.instanceId}`);
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div>
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/instances" class="mb-2">
        Back
      </UButton>
      <h1 class="text-xl font-semibold text-white">Create virtual instance</h1>
      <p class="text-sm text-slate-400">Provision a new Zitadel instance with its first org and owner.</p>
    </div>

    <UCard>
      <template #header><span class="font-medium">Instance</span></template>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Instance name" required>
          <UInput v-model="instanceName" placeholder="Acme Corp" icon="i-lucide-server" />
        </UFormField>
        <UFormField label="First org name">
          <UInput v-model="firstOrgName" placeholder="Acme" />
        </UFormField>
        <UFormField label="Custom domain">
          <UInput v-model="customDomain" placeholder="login.acme.com" icon="i-lucide-globe" />
        </UFormField>
        <UFormField label="Default language">
          <UInput v-model="defaultLanguage" placeholder="en" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header><span class="font-medium">Owner</span></template>
      <div class="mb-4 flex gap-2">
        <UButton :variant="ownerType === 'human' ? 'solid' : 'ghost'" @click="ownerType = 'human'">
          Human user
        </UButton>
        <UButton :variant="ownerType === 'machine' ? 'solid' : 'ghost'" @click="ownerType = 'machine'">
          Machine user
        </UButton>
      </div>

      <div v-if="ownerType === 'human'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Username" required><UInput v-model="humanUserName" /></UFormField>
        <UFormField label="Email" required><UInput v-model="humanEmail" type="email" /></UFormField>
        <UFormField label="First name" required><UInput v-model="humanFirstName" /></UFormField>
        <UFormField label="Last name" required><UInput v-model="humanLastName" /></UFormField>
        <UFormField label="Initial password" required><UInput v-model="humanPassword" type="password" /></UFormField>
      </div>

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Username" required><UInput v-model="machineUserName" /></UFormField>
        <UFormField label="Name" required><UInput v-model="machineName" /></UFormField>
        <p class="text-sm text-slate-500 sm:col-span-2">
          A personal access token and JSON machine key will be generated automatically and returned once.
        </p>
      </div>
    </UCard>

    <div class="flex justify-end gap-2">
      <UButton color="neutral" variant="ghost" to="/instances">Cancel</UButton>
      <UButton icon="i-lucide-plus" :loading="submitting" @click="submit">Create instance</UButton>
    </div>
  </div>
</template>