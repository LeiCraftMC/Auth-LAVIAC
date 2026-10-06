<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Row } from "@tanstack/vue-table";
import type { AdminSession } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Sessions | LAVIAC",
	description: "Active LAVIAC sessions",
});

const toast = useToast();

const sessions = await useAPIAsyncData<AdminSession[]>("admin-sessions", async () => {
	const res = await useAPI((api) => api.getAdminSessions({}));
	if (!res.success) {
		toast.add({ title: "Failed to load sessions", description: res.message, color: "error" });
		return [];
	}
	return res.data;
});

// OIDC sessions may have no name — search name, email and subject, null-safe.
const userFilter = {
	column: "user_name" as const,
	type: "text" as const,
	placeholder: "Search users...",
	icon: "i-lucide-search",
	filterFn: (row: Row<AdminSession>, _columnId: string, value: string) => {
		if (!value) return true;
		const needle = value.toLowerCase();
		const { user_name, user_email, user_sub } = row.original;
		return [user_name, user_email, user_sub].some((field) => field?.toLowerCase().includes(needle));
	},
};

const methodOptions = [
	{ label: "Zitadel (OIDC)", value: "oidc" },
	{ label: "Static login", value: "static" },
];

const columns: TableColumn<AdminSession>[] = [
	{ accessorKey: "user_name", header: "User" },
	{ accessorKey: "login_method", header: "Login" },
	{ accessorKey: "user_role", header: "Role" },
	{ accessorKey: "created_at", header: "Signed in" },
	{ accessorKey: "expires_at", header: "Expires" },
	{ id: "actions", header: "" },
];

const revokeOpen = ref(false);
const revokeTarget = ref<AdminSession | null>(null);
const revoking = ref(false);

function openRevoke(session: AdminSession) {
	revokeTarget.value = session;
	revokeOpen.value = true;
}

async function onRevoke() {
	const target = revokeTarget.value;
	if (!target) return;

	revoking.value = true;
	const res = await useAPI((api) =>
		api.deleteAdminSessionsBySessionId({ path: { sessionId: target.id } }),
	);
	revoking.value = false;

	if (!res.success) {
		toast.add({
			title: "Failed to revoke the session",
			description: res.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	revokeOpen.value = false;
	toast.add({
		title: "Session revoked",
		description: target.user_name ?? target.user_sub,
		color: "success",
	});
	await sessions.refresh();
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Sessions"
				icon="i-lucide-monitor-smartphone"
				description="Who is signed in to LAVIAC"
			/>
		</template>

		<template #body>
			<DashboardPageBody>
				<DashboardDataTable
					:data="sessions.data"
					:columns="columns"
					:loading="sessions.loading"
					:filters="[
						userFilter,
						{ column: 'login_method', type: 'select', placeholder: 'All logins', options: methodOptions },
					]"
					empty-title="No active sessions"
					empty-icon="i-lucide-monitor-smartphone"
					@refresh="sessions.refresh()"
				>
					<template #user_name-cell="{ row }">
						<div class="flex items-center gap-3">
							<Gravatar
								:email="row.original.user_email ?? undefined"
								:alt="row.original.user_name ?? row.original.user_sub"
								size="sm"
							/>
							<div class="min-w-0">
								<p class="flex items-center gap-2 font-medium text-white">
									{{ row.original.user_name ?? row.original.user_sub }}
									<UBadge v-if="row.original.current" color="primary" variant="soft" size="sm" label="You" />
								</p>
								<p class="truncate text-xs text-slate-500">{{ row.original.user_email ?? row.original.user_sub }}</p>
							</div>
						</div>
					</template>

					<template #login_method-cell="{ row }">
						<UBadge
							:color="row.original.login_method === 'oidc' ? 'primary' : 'warning'"
							:icon="row.original.login_method === 'oidc' ? 'i-lucide-shield-check' : 'i-lucide-key-round'"
							variant="soft"
							:label="row.original.login_method === 'oidc' ? 'Zitadel' : 'Static'"
						/>
					</template>

					<template #user_role-cell="{ row }">
						<UBadge :color="getRoleColor(row.original.user_role)" variant="soft" :label="row.original.user_role" />
					</template>

					<template #created_at-cell="{ row }">
						<span class="text-sm whitespace-nowrap">{{ formatDate(row.original.created_at) }}</span>
					</template>

					<template #expires_at-cell="{ row }">
						<span class="text-sm whitespace-nowrap">{{ formatDate(row.original.expires_at) }}</span>
					</template>

					<template #actions-cell="{ row }">
						<UButton
							v-if="!row.original.current"
							label="Revoke"
							icon="i-lucide-log-out"
							color="error"
							variant="ghost"
							size="sm"
							@click="openRevoke(row.original)"
						/>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>

	<DashboardModal
		v-model:open="revokeOpen"
		title="Revoke Session"
		description="The user is signed out on their next request."
		icon="i-lucide-log-out"
		icon-color="error"
	>
		<p class="text-sm text-slate-300">
			Sign out <strong class="text-white">{{ revokeTarget?.user_name ?? revokeTarget?.user_sub }}</strong>
			({{ revokeTarget?.login_method === "oidc" ? "Zitadel login" : "static login" }}, signed in
			{{ formatDate(revokeTarget?.created_at) }})?
		</p>

		<template #footer>
			<UButton label="Cancel" color="neutral" variant="outline" @click="revokeOpen = false" />
			<UButton label="Revoke Session" color="error" :loading="revoking" @click="onRevoke" />
		</template>
	</DashboardModal>
</template>
