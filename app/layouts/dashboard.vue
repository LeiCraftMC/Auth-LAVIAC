<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

// Sidebar groups — delete the ones (and their pages) your app doesn't need.
// LAVIAC has a single group: the virtual-instance management pages.
const mainItems: NavigationMenuItem[] = [
	{
		label: "Instances",
		icon: "i-lucide-server",
		to: "/instances",
		exact: true,
	},
];

const footerItems: NavigationMenuItem[] = [
	{
		label: "Back to Home",
		icon: "i-lucide-house",
		to: "/",
	},
];
</script>

<template>
	<NuxtLoadingIndicator color="var(--ui-primary)" position="top" />

	<UDashboardGroup class="main-bg-color text-slate-100">
		<UDashboardSidebar
			collapsible
			resizable
			:ui="{
				header: 'main-bg-color',
				body: 'main-bg-color',
				content: 'main-bg-color',
				footer: 'border-t border-default main-bg-color',
			}"
			:min-size="18"
			:default-size="20"
			:max-size="30"
		>
			<template #header="{ collapsed }">
				<NuxtLink to="/dashboard" :class="`${!collapsed ? 'ms-2.5' : ''} flex items-center gap-1.5`">
					<ImgAppLogo v-if="!collapsed" class="h-7" />
					<ImgAppIcon v-else class="h-8 w-8" />
				</NuxtLink>
			</template>

			<template #default="{ collapsed }">
				<UNavigationMenu :collapsed="collapsed" :items="mainItems" orientation="vertical" />

				<UNavigationMenu
					:collapsed="collapsed"
					:items="footerItems"
					orientation="vertical"
					class="mt-auto"
				/>
			</template>

			<template #footer="{ collapsed }">
				<DashboardUserMenu :collapsed="collapsed" />
			</template>
		</UDashboardSidebar>

		<slot />
	</UDashboardGroup>
</template>
