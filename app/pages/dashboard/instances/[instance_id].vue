<script setup lang="ts">
/**
 * Parent route for one virtual instance (`/dashboard/instances/<id>`). Loads the instance once
 * and hands it to the child pages via `useSubrouterInjectedData`; the toolbar/breadcrumbs come
 * from `useSubrouterPathDynamics`. Add sub-pages as `[instance_id]/<name>.vue` plus an entry in
 * `getRoutesConfig()`.
 */
import type { NuxtError } from "#app";
import type { UseSubrouterPathDynamics } from "~/composables/useSubrouterPathDynamics";
import type { Instance } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

const route = useRoute();
const toast = useToast();
const instanceId = safeDecodeURIComponent(route.params.instance_id as string);

let error: NuxtError | null = null;

const {
	data: result,
	refresh,
	loading,
} = await useAPIAsyncData(
	`instance-${instanceId}`,
	async () => await useAPI((api) => api.getInstancesByInstanceId({ path: { instanceId } })),
);

if (!result.value?.success) {
	error = createError({
		statusCode: result.value?.code || 500,
		statusMessage: result.value?.message || "Failed to load instance",
	});
}

// Keep the last loaded instance when a later refresh fails, so the child pages stay usable.
const instance = ref((result.value?.success ? result.value.data : null) as Instance);
watch(result, (latest) => {
	if (latest?.success) {
		instance.value = latest.data;
	} else if (latest && instance.value) {
		toast.add({
			title: "Failed to refresh the instance",
			description: latest.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
	}
});

useSubrouterInjectedData<Instance>("instance").provide({
	data: instance,
	refresh,
	loading,
});

function getRoutesConfig(): UseSubrouterPathDynamics.RoutesConfig {
	const base = `/dashboard/instances/${instanceId}`;
	// Read the name lazily so the breadcrumb and title follow a rename (the computed re-runs).
	const page = (label: string, description: (name: string) => string) => {
		const name = instance.value?.name ?? instanceId;
		return {
			seoSettings: { title: `${name} — ${label}`, description: description(name) },
			breadcrumbItems: [{ label: name, to: base }, ...(label === "General" ? [] : [{ label }])],
		};
	};

	return {
		[base]: {
			isNavLink: true,
			label: "General",
			icon: "i-lucide-info",
			exact: true,
			getDynamicValues: () => page("General", (name) => `Manage the virtual instance ${name}`),
		},
		[`${base}/domains`]: {
			isNavLink: true,
			label: "Domains",
			icon: "i-lucide-globe",
			getDynamicValues: () => page("Domains", (name) => `Domains of ${name}`),
		},
		[`${base}/limits`]: {
			isNavLink: true,
			label: "Limits",
			icon: "i-lucide-gauge",
			getDynamicValues: () => page("Limits", (name) => `Limits of ${name}`),
		},
		[`${base}/template`]: {
			isNavLink: true,
			label: "Template",
			icon: "i-lucide-layout-template",
			getDynamicValues: () => page("Template", (name) => `Template of ${name}`),
		},
		[`${base}/branding`]: {
			isNavLink: true,
			label: "Branding",
			icon: "i-lucide-palette",
			getDynamicValues: () => page("Branding", (name) => `Branding of ${name}`),
		},
	};
}

const subrouterPathDynamics = useSubrouterPathDynamics({
	baseTitle: "Instances | LAVIAC",
	basebreadcrumbItems: [{ label: "Instances", to: "/dashboard/instances" }],
	routes: getRoutesConfig(),
});

const routePathDynamicValues = await useAwaitedComputed(async () => {
	const values = await subrouterPathDynamics.getPathDynamicValues(route.path);
	useSeoMeta(values.seoSettings);
	return values;
});
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				icon="i-lucide-server"
				:breadcrumb-items="routePathDynamicValues.breadcrumbItems"
			>
				<template #right>
					<InstanceStateBadge v-if="instance" :state="instance.state" />
					<UButton
						icon="i-lucide-refresh-cw"
						color="neutral"
						variant="ghost"
						aria-label="Refresh instance"
						:loading="loading"
						@click="refresh()"
					/>
				</template>
			</DashboardPageHeader>

			<UDashboardToolbar>
				<!-- `-mx-1` aligns the menu with the sidebar collapse button. -->
				<UNavigationMenu :items="subrouterPathDynamics.links" highlight class="-mx-1 flex-1" />
			</UDashboardToolbar>
		</template>

		<template #body>
			<div class="flex w-full flex-col gap-4 sm:gap-6 lg:gap-12">
				<UError v-if="error" :error="error" />
				<NuxtPage v-else />
			</div>
		</template>
	</UDashboardPanel>
</template>
