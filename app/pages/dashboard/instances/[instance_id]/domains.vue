<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import { zPostInstancesByInstanceIdDomainsBody } from "~/api-client/zod.gen";
import type { Instance, InstanceDomain } from "~/utils/types";

const toast = useToast();

const instance = useSubrouterInjectedData<Instance>("instance").inject();
const instanceId = instance.data.value.id;

const domains = await useAPIAsyncData<InstanceDomain[]>(
	`instance-${instanceId}-domains`,
	async () => {
		const res = await useAPI((api) => api.getInstancesByInstanceIdDomains({ path: { instanceId } }));
		if (!res.success) {
			toast.add({ title: "Failed to load domains", description: res.message, color: "error" });
			return [];
		}
		return res.data;
	},
);

// Referenced here (not only in the template) so Biome keeps it a value import.
const addSchema = zPostInstancesByInstanceIdDomainsBody;
type AddSchema = z.output<typeof addSchema>;

const addState = reactive<AddSchema>({ domain: "" });
const adding = ref(false);

async function refreshAll() {
	await Promise.all([domains.refresh(), instance.refresh()]);
}

async function onAdd(event: FormSubmitEvent<AddSchema>) {
	adding.value = true;
	const res = await useAPI((api) =>
		api.postInstancesByInstanceIdDomains({ path: { instanceId }, body: event.data }),
	);
	adding.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to add domain",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({ title: "Domain added", description: event.data.domain, color: "success" });
	addState.domain = "";
	await refreshAll();
}

async function setPrimary(domain: string) {
	const res = await useAPI((api) =>
		api.postInstancesByInstanceIdDomainsSetPrimary({ path: { instanceId }, body: { domain } }),
	);
	if (!res.success) {
		toast.add({
			title: "Failed to set the primary domain",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({ title: "Primary domain updated", description: domain, color: "success" });
	await refreshAll();
}

const removeConfirmOpen = ref(false);
const removeTarget = ref<string | null>(null);

function openRemove(domain: string) {
	removeTarget.value = domain;
	removeConfirmOpen.value = true;
}

async function onRemoveDomain() {
	const domain = removeTarget.value;
	if (!domain) return;

	const res = await useAPI((api) =>
		api.deleteInstancesByInstanceIdDomainsByDomain({ path: { instanceId, domain } }),
	);
	if (!res.success) {
		toast.add({
			title: "Failed to remove domain",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		throw new Error(res.message);
	}

	toast.add({ title: "Domain removed", description: domain, color: "success" });
	await refreshAll();
}
</script>

<template>
	<div class="mx-auto w-full space-y-6 lg:w-3xl">
		<div>
			<h2 class="text-xl font-semibold text-white">Domains</h2>
			<p class="mt-1 text-sm text-slate-400">
				The instance answers on every listed domain; the primary one is used in links and emails.
			</p>
		</div>

		<DashboardSectionCard
			title="Instance Domains"
			description="Generated domains cannot be removed"
			icon="i-lucide-globe"
			flush
		>
			<template #actions>
				<UButton
					icon="i-lucide-refresh-cw"
					color="neutral"
					variant="ghost"
					aria-label="Refresh domains"
					:loading="domains.loading.value"
					@click="domains.refresh()"
				/>
			</template>

			<ul v-if="domains.data.value?.length" class="divide-y divide-slate-800">
				<li
					v-for="d in domains.data.value"
					:key="d.domain"
					class="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
				>
					<div class="flex min-w-0 items-center gap-2">
						<UIcon name="i-lucide-globe" class="shrink-0 text-slate-500" />
						<span class="truncate text-slate-200">{{ d.domain }}</span>
						<UBadge v-if="d.primary" color="primary" variant="soft" label="Primary" />
						<UBadge v-if="d.generated" color="neutral" variant="soft" label="Generated" />
					</div>
					<div class="flex gap-1">
						<UButton
							v-if="!d.primary"
							label="Make primary"
							size="sm"
							color="neutral"
							variant="ghost"
							@click="setPrimary(d.domain)"
						/>
						<UButton
							v-if="!d.generated"
							icon="i-lucide-trash"
							size="sm"
							color="error"
							variant="ghost"
							aria-label="Remove domain"
							@click="openRemove(d.domain)"
						/>
					</div>
				</li>
			</ul>
			<div v-else-if="domains.loading.value" class="flex justify-center py-8">
				<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
			</div>
			<UEmpty v-else variant="naked" icon="i-lucide-globe" title="No domains" class="py-8" />
		</DashboardSectionCard>

		<DashboardSectionCard title="Add Custom Domain" description="Point its DNS at Zitadel first" icon="i-lucide-plus">
			<UForm :schema="addSchema" :state="addState" class="divide-y divide-slate-800" @submit="onAdd">
				<UFormField
					name="domain"
					label="Domain"
					description="For example login.acme.com"
					required
					class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col"
					:ui="{ root: 'w-full sm:w-auto', container: 'w-full sm:w-auto' }"
				>
					<UInput v-model="addState.domain" placeholder="login.acme.com" icon="i-lucide-globe" class="w-full sm:w-80" />
				</UFormField>

				<div class="pt-4">
					<UButton label="Add Domain" type="submit" :loading="adding" icon="i-lucide-plus" />
				</div>
			</UForm>
		</DashboardSectionCard>

		<DashboardDeleteModal
			v-model:open="removeConfirmOpen"
			title="Remove Domain"
			:warning-text="`The instance stops answering on ${removeTarget ?? 'this domain'}. Logins and links using it will break.`"
			:on-delete="onRemoveDomain"
		/>
	</div>
</template>
