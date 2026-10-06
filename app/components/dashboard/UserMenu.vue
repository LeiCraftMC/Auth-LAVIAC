<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

defineProps<{
	collapsed?: boolean;
}>();

const toast = useToast();

const userInfoStore = useUserInfoStore();
const userInfo = await userInfoStore.use();

const isAdmin = computed(() => userInfo.value?.user_role === "admin");

const user = computed(() => {
	const name = userInfo.value?.user_name ?? userInfo.value?.user_sub ?? "Unknown User";
	return {
		name,
		avatar: {
			alt: name,
		},
	};
});

async function logout() {
	const result = await useAPI((api) => api.postAuthLogout({}), true);

	// Clear local state regardless of the API result.
	await userInfoStore.clear();
	useAppCookies().sessionToken.set(null);

	if (!result.success) {
		toast.add({
			title: "Logged out",
			description: "Your local session was cleared, but the server logout failed.",
			icon: "i-lucide-alert-circle",
			color: "warning",
		});
	} else {
		toast.add({
			title: "Logged out",
			description: "You have been successfully logged out.",
			icon: "i-lucide-check",
			color: "success",
		});
	}

	await navigateTo("/auth/login");
}

const items = computed<DropdownMenuItem[][]>(() => [
	[
		{
			type: "label",
			label: user.value.name,
			avatar: user.value.avatar,
		},
	],
	[
		{
			label: "Instances",
			icon: "i-lucide-server",
			to: "/dashboard/instances",
		},
		...(isAdmin.value
			? [
					{
						label: "Manage Sessions",
						icon: "i-lucide-monitor-smartphone",
						to: "/dashboard/admin/sessions",
					},
				]
			: []),
	],
	[
		{
			label: "Log out",
			icon: "i-lucide-log-out",
			onSelect: logout,
		},
	],
]);
</script>

<template>
	<UDropdownMenu
		:items="items"
		:content="{ align: 'center', collisionPadding: 12 }"
		:ui="{
			viewport: 'main-bg-color',
			content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)',
		}"
	>
		<UButton
			v-bind="{
				...user,
				label: collapsed ? undefined : user.name,
				trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down',
			}"
			color="neutral"
			variant="ghost"
			block
			:square="collapsed"
			class="data-[state=open]:bg-elevated/50 hover:bg-elevated/50"
			:ui="{
				trailingIcon: 'text-dimmed',
			}"
		/>
	</UDropdownMenu>
</template>
