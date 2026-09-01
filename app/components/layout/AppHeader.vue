<script setup lang="ts">
import { useUserStore } from '~/composables/stores/useUserStore';

const store = useUserStore();
const user = await store.use();

async function logout() {
	await useAPI((api) => api.postAuthLogout({}), true);
	useAppCookies().sessionToken.set(null);
	await store.clear();
	await navigateTo("/auth/login");
}
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-800 px-4">
    <div class="flex items-center gap-2 text-sm text-slate-400">
      <UIcon name="i-lucide-shield-check" class="text-sky-400" />
      <span>Virtual Instance Console</span>
    </div>

    <div class="flex items-center gap-3">
      <div v-if="user" class="text-right text-xs leading-tight">
        <div class="text-slate-200">{{ user.name ?? user.sub }}</div>
        <div class="text-slate-500">{{ user.email }}</div>
      </div>
      <UButton
        icon="i-lucide-log-out"
        color="neutral"
        variant="ghost"
        size="sm"
        label="Sign out"
        @click="logout"
      />
    </div>
  </header>
</template>