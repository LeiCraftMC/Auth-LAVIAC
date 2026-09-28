<script setup lang="ts">
import { z } from "zod";

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

// Which login methods are configured? Unauthenticated discovery endpoint.
const methods = await useAPI((api) => api.getAuthMethods({}), true);
// On a transient failure, assume the primary (OIDC) method is available.
const oidcEnabled = methods.success ? methods.data.oidc : true;
const staticEnabled = methods.success && methods.data.static;
const noMethods = methods.success && !methods.data.oidc && !methods.data.static;

const loginSchema = z.object({
	username: z.string().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
});
type LoginSchema = z.infer<typeof loginSchema>;

const form = ref<LoginSchema>({ username: "", password: "" });
const submitting = ref(false);
const loginError = ref("");

function signInWithZitadel() {
	if (import.meta.client) {
		window.location.assign(`/api/v1/auth/login?url=${encodeURIComponent(returnUrl)}`);
	}
}

async function onSubmit() {
	loginError.value = "";
	submitting.value = true;

	const result = await useAPI(
		(api) =>
			api.postAuthLogin({
				body: { username: form.value.username, password: form.value.password },
			}),
		true,
	);
	submitting.value = false;

	if (!result.success) {
		loginError.value = result.code === 429 ? result.message : "Invalid username or password.";
		return;
	}

	// docs/10-auth.md: the token is returned exactly once — keep it in the client-readable
	// session cookie and attach it as `Authorization: Bearer` via updateAPIClient.
	useAppCookies().sessionToken.set(result.data.token);
	updateAPIClient(result.data.token);
	await useUserStore().refresh();
	await navigateTo(returnUrl);
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="errorText" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ errorText }}
    </div>
    <div v-if="loginError" class="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
      {{ loginError }}
    </div>

    <p class="text-sm text-slate-400">
      Sign in to manage Zitadel virtual instances.
    </p>

    <UForm v-if="staticEnabled" :schema="loginSchema" :state="form" class="space-y-3" @submit="onSubmit">
      <UFormField label="Username" name="username">
        <UInput v-model="form.username" icon="i-lucide-user" class="w-full" autocomplete="username" />
      </UFormField>
      <UFormField label="Password" name="password">
        <UInput v-model="form.password" type="password" icon="i-lucide-lock" class="w-full" autocomplete="current-password" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="submitting" icon="i-lucide-key-round" label="Sign in" />
    </UForm>

    <USeparator v-if="oidcEnabled && staticEnabled" label="or" />

    <UButton
      v-if="oidcEnabled"
      icon="i-lucide-shield-check"
      label="Sign in with Zitadel"
      size="lg"
      block
      :color="staticEnabled ? 'neutral' : 'primary'"
      :variant="staticEnabled ? 'soft' : 'solid'"
      @click="signInWithZitadel"
    />

    <p v-if="noMethods" class="rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
      No login method is configured. Set the Zitadel OIDC variables or LAVIAC_STATIC_AUTH_PASSWORD_HASH.
    </p>
  </div>
</template>