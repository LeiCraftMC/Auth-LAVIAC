<script setup lang="ts">
/**
 * The settings an instance template applies, as served by the API (`describe()` in
 * server/lib/zitadel/templates.ts). Each row is tagged with where its value comes from.
 * Meant for a `flush` `DashboardSectionCard`.
 */
import type { TemplateSettingSection } from "~/utils/types";

defineProps<{ sections: TemplateSettingSection[] }>();
</script>

<template>
	<div class="divide-y divide-slate-800">
		<section
			v-for="section in sections"
			:key="section.id"
			:aria-labelledby="`template-settings-${section.id}`"
		>
			<div class="bg-slate-950/40 px-6 py-3">
				<h4 :id="`template-settings-${section.id}`" class="text-sm font-medium text-white">
					{{ section.title }}
				</h4>
				<p class="text-xs text-slate-400">{{ section.description }}</p>
			</div>

			<dl class="divide-y divide-slate-800/60">
				<div
					v-for="row in section.rows"
					:key="row.label"
					class="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2.5 text-sm"
				>
					<dt class="w-full text-slate-400 sm:w-56 sm:shrink-0">{{ row.label }}</dt>
					<dd class="min-w-0 flex-1 text-slate-200">{{ row.value }}</dd>
					<dd class="shrink-0">
						<InstanceTemplateSourceBadge :source="row.source" />
					</dd>
				</div>
			</dl>
		</section>
	</div>
</template>
