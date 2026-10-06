<script setup lang="ts">
// LAVIAC has no public landing page — `/` goes straight to the dashboard.
definePageMeta({ layout: false });
await navigateTo("/dashboard", { replace: true });
</script>

<template>
	<div />
</template>
