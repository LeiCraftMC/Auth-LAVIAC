<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const route = useRoute();
const user = await useUserInfoStore().use();

// LAVIAC has no public pages — the header links straight into the console.
const links = computed<NavigationMenuItem[]>(() => [
	{ label: "Dashboard", to: "/dashboard" },
	{ label: "API Docs", to: "/api/docs/v1", target: "_blank", external: true },
]);

const profileLabel = computed(() => user.value?.user_name || user.value?.user_sub || "Profile");

const loginRoute = computed(() =>
	route.path.startsWith("/auth")
		? "/auth/login"
		: `/auth/login?url=${encodeURIComponent(route.fullPath)}`,
);
</script>

<template>
	<UHeader class="backdrop-blur-xl">
		<template #title>
			<ImgAppLogo class="h-8" />
		</template>

		<UNavigationMenu :items="links" />

		<template #body>
			<UNavigationMenu :items="links" orientation="vertical" class="w-full" />
		</template>

		<template #right>
			<div class="flex items-center gap-2">
				<template v-if="user">
					<div class="hidden items-center gap-1.5 text-white sm:flex">
						<UIcon name="i-lucide-user" class="size-4" />
						<span class="text-sm">{{ profileLabel }}</span>
					</div>
					<UButton
						icon="i-lucide-layout-dashboard"
						to="/dashboard"
						color="primary"
						variant="soft"
						class="hidden sm:flex"
					>
						Dashboard
					</UButton>
				</template>

				<UButton v-else icon="i-lucide-log-in" :to="loginRoute" color="primary" variant="solid">
					Login
				</UButton>
			</div>
		</template>
	</UHeader>
</template>
