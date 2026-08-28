<script setup lang="ts">
const props = defineProps<{ state?: string }>();

const map: Record<string, { color: string; label: string }> = {
	STATE_RUNNING: { color: "success", label: "Running" },
	STATE_CREATING: { color: "info", label: "Creating" },
	STATE_DELETING: { color: "warning", label: "Deleting" },
	STATE_STOPPED: { color: "error", label: "Stopped" },
	STATE_UNSPECIFIED: { color: "neutral", label: "Unspecified" },
};

const entry = computed(
	() => map[props.state ?? ""] ?? { color: "neutral", label: props.state ?? "Unknown" },
);
</script>

<template>
  <UBadge :color="entry.color as any" variant="subtle" :label="entry.label" />
</template>