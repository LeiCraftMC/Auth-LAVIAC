<script setup lang="ts">
const props = defineProps<{ state?: string | null }>();

const entry = computed(() => getInstanceState(props.state));
</script>

<template>
	<UBadge :color="entry.color" variant="soft" :icon="entry.icon" :label="entry.label" />
</template>
