<script setup lang="ts">
import type { TemplateSettingSection } from "~/utils/types";

const props = defineProps<{
	source: TemplateSettingSection["rows"][number]["source"];
}>();

const entry = computed(() => TEMPLATE_SETTING_SOURCES[props.source]);
</script>

<template>
	<UBadge
		:color="entry.color"
		:variant="entry.variant"
		:icon="entry.icon"
		:label="entry.label"
		size="sm"
	/>
</template>
