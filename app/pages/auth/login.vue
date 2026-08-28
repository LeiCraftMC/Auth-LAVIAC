<script setup lang="ts">
definePageMeta({ layout: "auth" });
useSeoMeta({ title: "Sign in — LAVIAC" });

const route = useRoute();
const returnUrl = (route.query.url as string) ?? "/instances";
const errorKey = route.query.error as string | undefined;

const errorText = computed(() => {
	switch (errorKey) {
		case "forbidden":
			return "You are signed in, but your Zitadel account lacks the required admin role.";
		case "auth_failed":
			return "Authentication failed. Please try again.";
		default:
			return "";
	}
});

function signIn() {
	if (import.meta.client) {
		window.location.assign(`/api/v1/auth/login?url=${encodeURIComponent(returnUrl)}`);
	}
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="errorText" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ errorText }}
    </div>

    <p class="text-sm text-slate-400">
      Sign in with your LeiCraft_MC Auth (Zitadel) account to manage virtual instances.
    </p>

    <UButton
      icon="i-lucide-shield-check"
      label="Sign in with Zitadel"
      size="lg"
      block
      @click="signIn"
    />
  </div>
</template>