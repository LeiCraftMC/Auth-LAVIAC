<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{
	error: NuxtError;
}>();
</script>

<template>
	<!-- Internal-only app: no public header/footer around the error (see layouts/auth.vue). -->
	<div class="main-bg-color flex min-h-screen flex-col text-slate-100">
		<UMain class="flex flex-1 flex-col items-center justify-center px-4 py-10">
			<ImgAppLogo class="mb-8 h-8" />
			<UError :error="error" :ui="{ root: 'min-h-0' }" />
		</UMain>
	</div>
</template>
