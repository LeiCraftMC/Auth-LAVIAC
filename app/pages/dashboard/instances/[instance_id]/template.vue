<script setup lang="ts">
import type { Instance, InstanceTemplateSetup } from "~/utils/types";

const toast = useToast();

const instance = useSubrouterInjectedData<Instance>("instance").inject();
const instanceId = instance.data.value.id;

const templateSetup = await useAPIAsyncData<InstanceTemplateSetup | null>(
	`instance-${instanceId}-template`,
	async () => {
		const res = await useAPI((api) => api.getInstancesByInstanceIdTemplate({ path: { instanceId } }));
		if (!res.success) {
			toast.add({ title: "Failed to load the template", description: res.message, color: "error" });
			return null;
		}
		return res.data;
	},
);

const setup = computed(() => templateSetup.data.value?.setup ?? null);

/** The org that should be the default org once the template is applied. */
const expectedDefaultOrgId = computed(() => {
	const current = setup.value;
	if (!current) return null;
	return current.template.homeOrg ? current.homeOrgId : current.systemOrgId;
});

const details = computed(() => {
	const current = setup.value;
	if (!current) return [];
	const homeOrg = current.template.homeOrg;
	const defaultOrg = templateSetup.data.value?.defaultOrg;

	return [
		{ label: "Template", value: current.template.name },
		{ label: "Applied for", value: formatDate(current.createdAt) },
		...(homeOrg
			? [
					{ label: homeOrg.label, value: current.options.homeOrgName ?? "—" },
					{ label: `${homeOrg.label} ID`, value: current.homeOrgId ?? "Not created yet", mono: true },
					{
						label: `${homeOrg.label} domain`,
						value: current.options.homeOrgDomain ?? "None (generated domain only)",
					},
				]
			: []),
		{ label: "SYSTEM org ID", value: current.systemOrgId ?? "Not resolved yet", mono: true },
		...(current.template.asksOrgRegistration
			? [
					{
						label: "Org self-registration",
						value: current.options.allowOrgRegistration ? "Open" : "Closed",
					},
				]
			: []),
		{
			label: "Current default org",
			value: defaultOrg ? (defaultOrg.name ?? defaultOrg.id) : "—",
			check: defaultOrg ? defaultOrg.id === expectedDefaultOrgId.value : undefined,
		},
	];
});

const TASK_STATUS: Record<
	string,
	{ label: string; color: "success" | "error" | "info" | "warning" | "neutral"; icon: string }
> = {
	pending: { label: "Queued", color: "info", icon: "i-lucide-clock" },
	running: { label: "Running", color: "info", icon: "i-lucide-loader" },
	paused: { label: "Paused", color: "warning", icon: "i-lucide-pause" },
	completed: { label: "Applied", color: "success", icon: "i-lucide-check" },
	failed: { label: "Failed", color: "error", icon: "i-lucide-x" },
};

const lastTask = computed(() => templateSetup.data.value?.lastTask ?? null);
const taskInProgress = computed(
	// "paused" only resumes after a LAVIAC restart — no point polling for it.
	() => !!lastTask.value && ["pending", "running"].includes(lastTask.value.status),
);

// Poll while a provisioning task is queued or running.
let poll: ReturnType<typeof setInterval> | null = null;
watch(
	taskInProgress,
	(inProgress) => {
		if (inProgress && !poll && import.meta.client) {
			// Skip a tick while the previous refresh is still out — a new one would cancel it.
			poll = setInterval(() => {
				if (!templateSetup.loading.value) templateSetup.refresh();
			}, 3000);
		} else if (!inProgress && poll) {
			clearInterval(poll);
			poll = null;
		}
	},
	{ immediate: true },
);
onBeforeUnmount(() => {
	if (poll) clearInterval(poll);
});

const confirmOpen = ref(false);
const applying = ref(false);

async function applyTemplate() {
	applying.value = true;
	const res = await useAPI((api) =>
		api.postInstancesByInstanceIdTemplateApply({ path: { instanceId } }),
	);
	applying.value = false;
	confirmOpen.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to queue the template",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({
		title: "Template queued",
		description: `Task #${res.data.taskId} applies it in the background.`,
		icon: "i-lucide-check",
		color: "success",
	});
	await templateSetup.refresh();
}
</script>

<template>
	<div class="mx-auto w-full space-y-6 lg:w-3xl">
		<div>
			<h2 class="text-xl font-semibold text-white">Template</h2>
			<p class="mt-1 text-sm text-slate-400">
				The template this instance was created with and the settings it applied. The branding is
				applied separately (Branding tab).
			</p>
		</div>

		<div v-if="!templateSetup.data.value" class="flex justify-center py-8">
			<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
		</div>

		<UAlert
			v-else-if="!setup"
			color="neutral"
			variant="subtle"
			icon="i-lucide-history"
			title="Created before templates"
			description="LAVIAC did not apply a template to this instance: it has no SYSTEM org, security baseline or home org from LAVIAC."
		/>

		<template v-else>
			<UAlert
				v-if="templateSetup.data.value.error"
				color="warning"
				variant="subtle"
				icon="i-lucide-alert-triangle"
				title="The current default org could not be read"
				:description="templateSetup.data.value.error"
			/>

			<DashboardSectionCard :title="setup.template.name" :description="setup.template.summary" :icon="setup.template.icon">
				<template #actions>
					<UButton
						icon="i-lucide-refresh-cw"
						color="neutral"
						variant="ghost"
						aria-label="Refresh template"
						:loading="templateSetup.loading.value"
						@click="templateSetup.refresh()"
					/>
				</template>

				<dl class="grid gap-4 text-sm sm:grid-cols-2">
					<div v-for="detail in details" :key="detail.label">
						<dt class="text-slate-500">{{ detail.label }}</dt>
						<dd :class="['mt-0.5 flex items-center gap-1.5 text-slate-200', detail.mono ? 'font-mono text-xs' : '']">
							{{ detail.value }}
							<UIcon
								v-if="detail.check !== undefined"
								:name="detail.check ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
								:class="detail.check ? 'text-emerald-400' : 'text-amber-400'"
								:aria-label="detail.check ? 'As the template set it' : 'Differs from the template'"
							/>
						</dd>
					</div>
				</dl>
			</DashboardSectionCard>

			<UAlert
				color="warning"
				variant="subtle"
				icon="i-lucide-user-cog"
				title="Initial admin"
				description="The owner given at creation lives in the SYSTEM org as the instance's first IAM owner. Use it to set up the instance, then create admin accounts in the home org, give them IAM owner rights and remove or deactivate it. Signing in to the SYSTEM org requires MFA."
			/>

			<DashboardSectionCard
				title="Apply the Template"
				description="Runs as a background task with retries"
				icon="i-lucide-play"
			>
				<div class="flex flex-col gap-4 md:flex-row md:items-center">
					<div class="flex-1 space-y-2 text-sm">
						<template v-if="lastTask">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-slate-400">Last run:</span>
								<UBadge
									:color="TASK_STATUS[lastTask.status]?.color ?? 'neutral'"
									:icon="TASK_STATUS[lastTask.status]?.icon"
									variant="soft"
								>
									{{ TASK_STATUS[lastTask.status]?.label ?? lastTask.status }}
								</UBadge>
								<span class="text-slate-500">{{ formatRelative(lastTask.created_at) }}</span>
								<NuxtLink
									:to="`/dashboard/admin/tasks?task=${lastTask.id}`"
									class="text-primary hover:underline"
								>
									Task #{{ lastTask.id }}
								</NuxtLink>
							</div>
							<p v-if="lastTask.message" class="text-slate-400">{{ lastTask.message }}</p>
						</template>
						<p v-else class="text-slate-400">No provisioning task has run for this instance yet.</p>
						<p class="text-slate-400">
							Applying again overwrites the settings below if they were changed in the Console.
						</p>
					</div>
					<UButton
						label="Apply Again"
						icon="i-lucide-play"
						:loading="applying || taskInProgress"
						@click="confirmOpen = true"
					/>
				</div>
			</DashboardSectionCard>

			<DashboardSectionCard
				title="Applied Settings"
				description="What the template writes, with the options chosen at creation"
				icon="i-lucide-list-checks"
				flush
			>
				<InstanceTemplateSettings :sections="setup.sections" />
			</DashboardSectionCard>
		</template>

		<DashboardModal
			v-model:open="confirmOpen"
			title="Apply the Template Again"
			icon="i-lucide-alert-triangle"
			icon-color="amber"
		>
			<p class="text-sm text-slate-300">
				The SYSTEM org lockdown, the instance defaults, the home org's policies and the default org
				are written again. Changes made to these settings in the Console since are overwritten.
				Nothing is deleted, and users and apps are not touched.
			</p>

			<template #footer>
				<UButton label="Cancel" color="neutral" variant="ghost" @click="confirmOpen = false" />
				<UButton label="Apply" icon="i-lucide-play" :loading="applying" @click="applyTemplate" />
			</template>
		</DashboardModal>
	</div>
</template>
