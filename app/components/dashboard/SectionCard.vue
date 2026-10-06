<script setup lang="ts">
/**
 * The docs/15 section card: icon header + body. `tone="danger"` renders the danger zone.
 * Header actions go in `#actions`; set `flush` to drop the body padding (tables, lists).
 */
withDefaults(
	defineProps<{
		title: string;
		description?: string;
		icon: string;
		tone?: "default" | "danger";
		flush?: boolean;
	}>(),
	{
		description: undefined,
		tone: "default",
		flush: false,
	},
);
</script>

<template>
	<div
		:class="[
			'overflow-hidden rounded-xl border backdrop-blur-sm',
			tone === 'danger' ? 'border-red-900/50 bg-red-950/20' : 'border-slate-800 bg-slate-900/60',
		]"
	>
		<div
			:class="[
				'flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4',
				tone === 'danger' ? 'border-red-900/50' : 'border-slate-800',
			]"
		>
			<div class="flex items-center gap-3">
				<div
					:class="[
						'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
						tone === 'danger' ? 'bg-red-500/10' : 'bg-primary/10',
					]"
				>
					<UIcon
						:name="icon"
						:class="['h-5 w-5', tone === 'danger' ? 'text-red-400' : 'text-primary-400']"
					/>
				</div>
				<div>
					<h3 :class="['font-medium', tone === 'danger' ? 'text-red-400' : 'text-white']">
						{{ title }}
					</h3>
					<p v-if="description" class="text-sm text-slate-400">{{ description }}</p>
				</div>
			</div>

			<div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
				<slot name="actions" />
			</div>
		</div>

		<div :class="flush ? '' : 'p-6'">
			<slot />
		</div>
	</div>
</template>
