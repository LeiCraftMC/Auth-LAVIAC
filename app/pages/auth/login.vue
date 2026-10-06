<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from "@nuxt/ui";
import * as z from "zod";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

definePageMeta({
	layout: "auth",
});

useSeoMeta({
	title: "Login | LAVIAC",
	description: "Sign in to manage Zitadel virtual instances",
});

const route = useRoute();
const toast = useToast();

// Only follow internal redirects (`/…`, not `//evil.example`); default to the dashboard.
const requestedUrl = route.query.url?.toString() ?? "";
const redirectUrl =
	requestedUrl.startsWith("/") && !requestedUrl.startsWith("//") ? requestedUrl : "/dashboard";

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
// The static login is required at boot; on a transient methods-fetch failure assume it
// is available (and that the primary OIDC method is too).
const methods = await useAPI((api) => api.getAuthMethods({}), true);
const oidcEnabled = methods.success ? methods.data.oidc : true;
const staticEnabled = methods.success ? methods.data.static : true;

const fields: AuthFormField[] = [
	{
		name: "username",
		type: "text",
		label: "Username",
		placeholder: "Enter your username",
		required: true,
	},
	{
		name: "password",
		label: "Password",
		type: "password",
		placeholder: "Enter your password",
		required: true,
	},
	{
		name: "remember",
		label: "Remember me",
		type: "checkbox",
		description: "You will stay logged in for 30 days.",
	},
];

const schema = z.object({
	username: z.string("Username is required").trim().min(1, "Username is required"),
	password: z.string("Password is required").min(1, "Password is required"),
	remember: z.boolean().optional(),
});

type Schema = z.output<typeof schema>;

const loading = ref(false);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
	loading.value = true;

	const result = await useAPI(
		(api) =>
			api.postAuthLogin({
				body: { username: payload.data.username, password: payload.data.password },
			}),
		true,
	);

	loading.value = false;

	if (!result.success) {
		const invalidCredentials = (result.code as number) === 401;
		toast.add({
			title: invalidCredentials ? "Invalid Username or Password" : "Login Failed",
			description: invalidCredentials
				? "Please check your credentials and try again."
				: result.message || "An error occurred during login. Please try again later.",
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	// docs/10-auth.md: the token is returned once — store it in the client-readable
	// session cookie (30 days only with "remember me") and attach it as bearer.
	useAppCookies().sessionToken.set(result.data.token, {
		maxAge: payload.data.remember ? 60 * 60 * 24 * 30 : undefined,
	});
	updateAPIClient(result.data.token);

	// Fresh per-user state for the new session.
	await useUserInfoStore().refresh();

	toast.add({
		title: "Login Successful",
		description: "You have been logged in successfully.",
		icon: "i-lucide-check",
		color: "success",
	});

	await navigateTo(redirectUrl);
}

function signInWithZitadel() {
	if (import.meta.client) {
		window.location.assign(`/api/v1/auth/login?url=${encodeURIComponent(redirectUrl)}`);
	}
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="errorText"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-circle"
      :description="errorText"
    />

    <UAuthForm
      v-if="staticEnabled"
      :schema="schema"
      title="Login"
      description="Enter the static admin credentials."
      icon="i-lucide-shield-check"
      :fields="fields"
      :submit="{ label: 'Login', loading }"
      @submit="onSubmit"
    />

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

    <UAlert
      v-if="!staticEnabled && !oidcEnabled"
      color="warning"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      description="No login method is configured. Set the Zitadel OIDC variables or LAVIAC_STATIC_AUTH_PASSWORD_HASH."
    />
  </div>
</template>