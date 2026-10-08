<script setup lang="ts">
/** Radio cards for choosing an instance template (`v-model` = the template id). */
import type { InstanceTemplate, TemplateId } from "~/utils/types";

const props = defineProps<{ templates: InstanceTemplate[] }>();
const model = defineModel<TemplateId>({ required: true });

const items = computed(() =>
	props.templates.map((template) => ({
		label: template.name,
		description: template.summary,
		value: template.id,
		icon: template.icon,
	})),
);
</script>

<template>
	<!-- `indicator="hidden"`: NuxtUI only renders item icons without the radio dot; the card's
	     highlight marks the selection. -->
	<URadioGroup
		v-model="model"
		:items="items"
		variant="card"
		indicator="hidden"
		:ui="{ fieldset: 'grid gap-3 sm:grid-cols-2', icon: 'mb-1 size-5 text-primary-400' }"
	/>
</template>
