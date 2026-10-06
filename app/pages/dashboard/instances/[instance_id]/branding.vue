<script setup lang="ts">
import type { Instance, InstanceBranding, LabelPolicy } from "~/utils/types";

const toast = useToast();

const instance = useSubrouterInjectedData<Instance>("instance").inject();
const instanceId = instance.data.value.id;

const branding = await useAPIAsyncData<InstanceBranding | null>(
	`instance-${instanceId}-branding`,
	async () => {
		const res = await useAPI((api) => api.getInstancesByInstanceIdBranding({ path: { instanceId } }));
		if (!res.success) {
			toast.add({ title: "Failed to load branding", description: res.message, color: "error" });
			return null;
		}
		return res.data;
	},
);

const colorFields = [
	{ key: "backgroundColor", label: "Background" },
	{ key: "primaryColor", label: "Primary" },
	{ key: "warnColor", label: "Warning" },
	{ key: "fontColor", label: "Font" },
] as const satisfies { key: keyof LabelPolicy; label: string }[];

const THEME_MODES: Record<string, string> = {
	THEME_MODE_DARK: "Dark only",
	THEME_MODE_LIGHT: "Light only",
	THEME_MODE_AUTO: "Auto (light + dark)",
	THEME_MODE_UNSPECIFIED: "Unspecified",
};

const rows = computed(() => {
	const data = branding.data.value;
	if (!data) return [];
	const current = data.policy;
	// The theme is dark-only, so the dark variants are the ones visitors see.
	const darkKey = (key: (typeof colorFields)[number]["key"]) => `${key}Dark` as keyof LabelPolicy;

	return [
		...colorFields.map((field) => {
			const expected = data.defaults[field.key] as string | undefined;
			const actual = (current?.[darkKey(field.key)] ?? current?.[field.key]) as string | undefined;
			return {
				label: field.label,
				expected,
				actual,
				color: true,
				matches: !!actual && actual.toLowerCase() === expected?.toLowerCase(),
			};
		}),
		{
			label: "Theme",
			expected: THEME_MODES[data.defaults.themeMode ?? ""] ?? data.defaults.themeMode,
			actual: current?.themeMode ? (THEME_MODES[current.themeMode] ?? current.themeMode) : undefined,
			color: false,
			matches: current?.themeMode === data.defaults.themeMode,
		},
		{
			label: "Zitadel watermark",
			expected: data.defaults.disableWatermark ? "Hidden" : "Shown",
			actual: current ? (current.disableWatermark ? "Hidden" : "Shown") : undefined,
			color: false,
			matches: current?.disableWatermark === data.defaults.disableWatermark,
		},
		{
			label: "Font",
			expected: data.defaultFont.fileName,
			actual: current ? (current.fontUrl ? "Custom font" : "Zitadel default") : undefined,
			color: false,
			matches: !!current?.fontUrl,
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

const lastTask = computed(() => branding.data.value?.lastTask ?? null);
const taskInProgress = computed(
	// "paused" only resumes after a LAVIAC restart — no point polling for it.
	() => !!lastTask.value && ["pending", "running"].includes(lastTask.value.status),
);

// Poll while a branding task is queued or running.
let poll: ReturnType<typeof setInterval> | null = null;
watch(
	taskInProgress,
	(inProgress) => {
		if (inProgress && !poll && import.meta.client) {
			// Skip a tick while the previous refresh is still out — a new one would cancel it.
			poll = setInterval(() => {
				if (!branding.loading.value) branding.refresh();
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

const applying = ref(false);

async function applyDefaults() {
	applying.value = true;
	const res = await useAPI((api) =>
		api.postInstancesByInstanceIdBrandingApplyDefaults({ path: { instanceId } }),
	);
	applying.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to queue the default branding",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({
		title: "Default branding queued",
		description: `Task #${res.data.taskId} applies it in the background.`,
		icon: "i-lucide-check",
		color: "success",
	});
	await branding.refresh();
}
</script>

<template>
	<div class="mx-auto w-full space-y-6 lg:w-3xl">
		<div>
			<h2 class="text-xl font-semibold text-white">Branding</h2>
			<p class="mt-1 text-sm text-slate-400">
				The instance's login and console branding (default label policy) compared with the
				LAVIAC defaults every new instance receives.
			</p>
		</div>

		<UAlert
			v-if="branding.data.value?.error"
			color="warning"
			variant="subtle"
			icon="i-lucide-alert-triangle"
			title="The current branding could not be read"
			:description="branding.data.value.error"
		/>

		<DashboardSectionCard
			title="Label Policy"
			:description="branding.data.value?.instanceHost ? `Read via ${branding.data.value.instanceHost}` : 'Current vs. LAVIAC default'"
			icon="i-lucide-palette"
			flush
		>
			<template #actions>
				<UButton
					icon="i-lucide-refresh-cw"
					color="neutral"
					variant="ghost"
					aria-label="Refresh branding"
					:loading="branding.loading.value"
					@click="branding.refresh()"
				/>
			</template>

			<div v-if="!branding.data.value" class="flex justify-center py-8">
				<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
			</div>

			<table v-else class="w-full text-sm">
				<thead>
					<tr class="border-b border-slate-800 text-left text-slate-400">
						<th class="px-6 py-3 font-medium">Setting</th>
						<th class="px-6 py-3 font-medium">Current</th>
						<th class="px-6 py-3 font-medium">LAVIAC default</th>
						<th class="px-6 py-3"><span class="sr-only">Matches</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-800">
					<tr v-for="row in rows" :key="row.label">
						<td class="px-6 py-3 text-slate-300">{{ row.label }}</td>
						<td class="px-6 py-3">
							<span v-if="row.actual" class="inline-flex items-center gap-2 text-slate-200">
								<span
									v-if="row.color"
									class="size-4 rounded border border-slate-700"
									:style="{ backgroundColor: row.actual }"
								/>
								<span :class="row.color ? 'font-mono text-xs' : ''">{{ row.actual }}</span>
							</span>
							<span v-else class="text-slate-500">—</span>
						</td>
						<td class="px-6 py-3">
							<span class="inline-flex items-center gap-2 text-slate-200">
								<span
									v-if="row.color && row.expected"
									class="size-4 rounded border border-slate-700"
									:style="{ backgroundColor: row.expected }"
								/>
								<span :class="row.color ? 'font-mono text-xs' : ''">{{ row.expected }}</span>
							</span>
						</td>
						<td class="px-6 py-3 text-right">
							<UIcon
								v-if="row.actual"
								:name="row.matches ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
								:class="row.matches ? 'text-emerald-400' : 'text-slate-500'"
								:aria-label="row.matches ? 'Matches the default' : 'Differs from the default'"
							/>
						</td>
					</tr>
				</tbody>
			</table>
		</DashboardSectionCard>

		<DashboardSectionCard
			title="Apply LAVIAC Default Branding"
			description="Runs as a background task with retries"
			icon="i-lucide-paint-roller"
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
					<p v-else class="text-slate-400">
						No default-branding task has run for this instance yet.
					</p>
					<p
						v-if="branding.data.value && !branding.data.value.defaultFont.available"
						class="flex items-center gap-1.5 text-slate-300"
					>
						<UIcon name="i-lucide-alert-triangle" class="text-amber-400" />
						The default font is unavailable on this server — only colors and theme are applied.
					</p>
				</div>
				<UButton
					label="Apply Defaults"
					icon="i-lucide-paint-roller"
					:loading="applying || taskInProgress"
					@click="applyDefaults"
				/>
			</div>
		</DashboardSectionCard>
	</div>
</template>
