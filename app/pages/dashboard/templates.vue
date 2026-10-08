<script setup lang="ts">
import type { InstanceTemplates, TemplateId } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "Templates | LAVIAC",
	description: "What each instance template configures",
});

const route = useRoute();
const toast = useToast();

/** Set when the last load failed — shown instead of the loading spinner. */
const loadError = ref<string | null>(null);

const templates = await useAPIAsyncData<InstanceTemplates | null>(
	"instance-templates",
	async () => {
		const res = await useAPI((api) => api.getInstanceTemplates({}));
		if (!res.success) {
			loadError.value = res.message;
			toast.add({ title: "Failed to load the templates", description: res.message, color: "error" });
			return null;
		}
		loadError.value = null;
		return res.data;
	},
);

const list = computed(() => templates.data.value?.templates ?? []);

const requested = route.query.template as TemplateId | undefined;
const selectedId = ref<TemplateId>(
	list.value.some((t) => t.id === requested) ? (requested as TemplateId) : "private",
);
const selected = computed(() => list.value.find((t) => t.id === selectedId.value) ?? null);
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				title="Templates"
				icon="i-lucide-layout-template"
				description="What each instance template configures"
			/>
		</template>

		<template #body>
			<div class="mx-auto w-full space-y-6 lg:w-3xl">
				<div>
					<h2 class="text-xl font-semibold text-white">Instance Templates</h2>
					<p class="mt-1 text-sm text-slate-400">
						Every new instance is created from a template. Templates are defined in LAVIAC's code
						and can't be edited here. The LAVIAC default branding is applied separately and is the
						same for every template.
					</p>
				</div>

				<UAlert
					v-if="!templates.data.value && loadError"
					color="error"
					variant="subtle"
					icon="i-lucide-alert-circle"
					title="The templates could not be loaded"
					:description="loadError"
					:actions="[
						{
							label: 'Retry',
							icon: 'i-lucide-refresh-cw',
							color: 'neutral',
							variant: 'outline',
							loading: templates.loading.value,
							onClick: () => templates.refresh(),
						},
					]"
				/>

				<div v-else-if="!templates.data.value" class="flex justify-center py-8">
					<UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
				</div>

				<template v-else>
					<DashboardSectionCard
						title="Template"
						description="Pick a template to see its settings"
						icon="i-lucide-layout-template"
					>
						<InstanceTemplatePicker v-model="selectedId" :templates="list" />
					</DashboardSectionCard>

					<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
						<span
							v-for="(source, key) in TEMPLATE_SETTING_SOURCES"
							:key="key"
							class="inline-flex items-center gap-2"
						>
							<InstanceTemplateSourceBadge :source="key" />
							{{ source.description }}
						</span>
					</div>

					<DashboardSectionCard
						v-if="selected"
						:title="selected.name"
						:description="selected.summary"
						:icon="selected.icon"
						flush
					>
						<template #actions>
							<UButton
								label="Create Instance"
								icon="i-lucide-plus"
								:to="`/dashboard/instances/new?template=${selected.id}`"
							/>
						</template>

						<InstanceTemplateSettings :sections="selected.sections" />
					</DashboardSectionCard>
				</template>
			</div>
		</template>
	</UDashboardPanel>
</template>
