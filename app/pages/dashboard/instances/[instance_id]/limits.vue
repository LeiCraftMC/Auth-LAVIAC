<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import { zPutInstancesByInstanceIdLimitsBody } from "~/api-client/zod.gen";
import type { Instance } from "~/utils/types";

const toast = useToast();

const instance = useSubrouterInjectedData<Instance>("instance").inject();
const instanceId = instance.data.value.id;

// Referenced here (not only in the template) so Biome keeps it a value import.
const limitsSchema = zPutInstancesByInstanceIdLimitsBody;
type LimitsSchema = z.output<typeof limitsSchema>;

// The System API has no "get limits" — the form starts empty and only sends what is set.
const state = reactive<LimitsSchema>({ auditLogRetention: "", block: null });

const accessOptions = [
	{ label: "Unchanged", value: null },
	{ label: "Active", value: false },
	{ label: "Blocked", value: true },
];

const saving = ref(false);
const resetting = ref(false);

async function onSubmit(event: FormSubmitEvent<LimitsSchema>) {
	saving.value = true;
	const res = await useAPI((api) =>
		api.putInstancesByInstanceIdLimits({
			path: { instanceId },
			body: {
				auditLogRetention: event.data.auditLogRetention || undefined,
				block: event.data.block,
			},
		}),
	);
	saving.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to update limits",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({ title: "Limits updated", icon: "i-lucide-check", color: "success" });
}

async function onReset() {
	resetting.value = true;
	const res = await useAPI((api) => api.deleteInstancesByInstanceIdLimits({ path: { instanceId } }));
	resetting.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to reset limits",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	state.auditLogRetention = "";
	state.block = null;
	toast.add({ title: "Limits reset to the defaults", icon: "i-lucide-check", color: "success" });
}
</script>

<template>
	<div class="mx-auto w-full space-y-6 lg:w-3xl">
		<div>
			<h2 class="text-xl font-semibold text-white">Limits</h2>
			<p class="mt-1 text-sm text-slate-400">
				Audit-log retention and access of this instance. Empty fields stay unchanged.
			</p>
		</div>

		<DashboardSectionCard title="Instance Limits" description="Applied through the System API" icon="i-lucide-gauge">
			<UForm :schema="limitsSchema" :state="state" class="divide-y divide-slate-800" @submit="onSubmit">
				<UFormField
					name="auditLogRetention"
					label="Audit log retention"
					description="A protobuf duration, e.g. 720h for 30 days."
					class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col"
					:ui="{ root: 'w-full sm:w-auto', container: 'w-full sm:w-auto' }"
				>
					<UInput v-model="state.auditLogRetention" placeholder="720h" icon="i-lucide-clock" class="w-full sm:w-60" />
				</UFormField>

				<UFormField
					name="block"
					label="Instance access"
					description="A blocked instance rejects all requests."
					class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col"
					:ui="{ root: 'w-full sm:w-auto', container: 'w-full sm:w-auto' }"
				>
					<USelect v-model="state.block" :items="accessOptions" class="w-full sm:w-60" />
				</UFormField>

				<div class="flex flex-wrap gap-2 pt-4">
					<UButton label="Save Limits" type="submit" :loading="saving" icon="i-lucide-save" />
					<UButton
						label="Reset to Defaults"
						color="neutral"
						variant="ghost"
						icon="i-lucide-rotate-ccw"
						:loading="resetting"
						@click="onReset"
					/>
				</div>
			</UForm>
		</DashboardSectionCard>
	</div>
</template>
