<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const user = await useUserInfoStore().use();
const isAdmin = computed(() => user.value?.user_role === "admin");

const mainItems: NavigationMenuItem[] = [
	{
		label: "Overview",
		icon: "i-lucide-layout-dashboard",
		to: "/dashboard",
		exact: true,
	},
	{
		label: "Instances",
		icon: "i-lucide-server",
		to: "/dashboard/instances",
	},
];

const adminItems: NavigationMenuItem[] = [
	{
		label: "Admin",
		icon: "i-lucide-shield",
		type: "label",
	},
	{
		label: "Statistics",
		icon: "i-lucide-chart-column",
		to: "/dashboard/admin/statistics",
	},
	{
		label: "System",
		icon: "i-lucide-cpu",
		to: "/dashboard/admin/system",
	},
	{
		label: "Updates",
		icon: "i-lucide-package-check",
		to: "/dashboard/admin/updates",
	},
	{
		label: "Audit Log",
		icon: "i-lucide-scroll-text",
		to: "/dashboard/admin/audit",
	},
	{
		label: "Tasks",
		icon: "i-lucide-list-checks",
		to: "/dashboard/admin/tasks",
	},
	{
		label: "Sessions",
		icon: "i-lucide-monitor-smartphone",
		to: "/dashboard/admin/sessions",
	},
];

const footerItems: NavigationMenuItem[] = [
	{
		label: "API Docs",
		icon: "i-lucide-book-open",
		to: "/api/docs/v1",
		target: "_blank",
		external: true,
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
					v-if="isAdmin"
					:collapsed="collapsed"
					:items="adminItems"
					orientation="vertical"
				/>

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
