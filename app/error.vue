<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{
	error: NuxtError;
}>();
</script>

<template>
	<div class="main-bg-color flex min-h-screen flex-col text-slate-100">
		<UMain class="flex flex-1 items-center justify-center">
			<UError :error="error" />
		</UMain>
	</div>
</template>