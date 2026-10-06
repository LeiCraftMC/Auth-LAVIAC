<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import * as z from "zod";
import type { CreatedInstance, NewInstance } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "New Instance | LAVIAC",
	description: "Provision a new Zitadel instance with its first org and owner",
});

const toast = useToast();
const onError = await useDefaultOnFormError();

// The form is flat; `onSubmit` builds the nested `human` | `machine` request body.
const schema = z.object({
	instanceName: z.string("Instance name is required").trim().min(1, "Instance name is required"),
	firstOrgName: z.string().optional(),
	customDomain: z.string().optional(),
	defaultLanguage: z.string(),
	ownerType: z.enum(["human", "machine"]),
	userName: z.string("Username is required").trim().min(1, "Username is required"),
	email: z.string().optional(),
	firstName: z.string().optional(),
	lastName: z.string().optional(),
	password: z.string().optional(),
	passwordChangeRequired: z.boolean(),
	machineName: z.string().optional(),
	createPat: z.boolean(),
	createMachineKey: z.boolean(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
	instanceName: "",
	firstOrgName: "",
	customDomain: "",
	defaultLanguage: "en",
	ownerType: "human",
	userName: "",
	email: "",
	firstName: "",
	lastName: "",
	password: "",
	passwordChangeRequired: true,
	machineName: "",
	createPat: true,
	createMachineKey: false,
});

function validate(form: Partial<Schema>): FormError[] {
	const errors: FormError[] = [];
	if (form.ownerType === "human") {
		if (!z.email().safeParse(form.email ?? "").success) {
			errors.push({ name: "email", message: "A valid email is required" });
		}
		if (!form.firstName?.trim())
			errors.push({ name: "firstName", message: "First name is required" });
		if (!form.lastName?.trim()) errors.push({ name: "lastName", message: "Last name is required" });
		if (!form.password) errors.push({ name: "password", message: "An initial password is required" });
	} else if (!form.machineName?.trim()) {
		errors.push({ name: "machineName", message: "Name is required" });
	}
	return errors;
}

const ownerTypes = [
	{ label: "Human user", value: "human", description: "Signs in with a password" },
	{ label: "Machine user", value: "machine", description: "Automation via token or key" },
];

const languages = [
	{ label: "English", value: "en" },
	{ label: "German", value: "de" },
	{ label: "French", value: "fr" },
	{ label: "Italian", value: "it" },
	{ label: "Spanish", value: "es" },
	{ label: "Portuguese", value: "pt" },
	{ label: "Dutch", value: "nl" },
	{ label: "Polish", value: "pl" },
	{ label: "Czech", value: "cs" },
	{ label: "Swedish", value: "sv" },
	{ label: "Japanese", value: "ja" },
	{ label: "Chinese", value: "zh" },
];

const creating = ref(false);
const created = ref<CreatedInstance | null>(null);

async function onSubmit(event: FormSubmitEvent<Schema>) {
	const form = event.data;

	const body: NewInstance = {
		instanceName: form.instanceName,
		firstOrgName: form.firstOrgName || undefined,
		customDomain: form.customDomain || undefined,
		defaultLanguage: form.defaultLanguage,
	};

	if (form.ownerType === "human") {
		body.human = {
			userName: form.userName,
			email: { email: form.email ?? "", isEmailVerified: true },
			profile: {
				firstName: form.firstName ?? "",
				lastName: form.lastName ?? "",
				preferredLanguage: form.defaultLanguage,
			},
			password: {
				password: form.password ?? "",
				passwordChangeRequired: form.passwordChangeRequired,
			},
		};
	} else {
		body.machine = {
			userName: form.userName,
			name: form.machineName ?? "",
			personalAccessToken: form.createPat ? {} : undefined,
			machineKey: form.createMachineKey ? { type: "KEY_TYPE_JSON" } : undefined,
		};
	}

	creating.value = true;
	const result = await useAPI((api) => api.postInstances({ body }));
	creating.value = false;

	if (!result.success) {
		toast.add({
			title: "Failed to create instance",
			description: result.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	toast.add({
		title: "Instance created",
		description:
			result.data.brandingTaskId !== null
				? "The LAVIAC default branding is being applied in the background."
				: undefined,
		icon: "i-lucide-check",
		color: "success",
	});

	// Owner credentials are returned exactly once — show them before leaving the page.
	if (result.data.pat || result.data.machineKey) {
		created.value = result.data;
		return;
	}

	await navigateTo(`/dashboard/instances/${result.data.instanceId}`);
}

async function copy(value: string | undefined) {
	if (!value) return;
	try {
		await navigator.clipboard.writeText(value);
		toast.add({ title: "Copied to clipboard", icon: "i-lucide-clipboard-check", color: "success" });
	} catch {
		toast.add({
			title: "Copy failed",
			description: "Select the value and copy it manually.",
			color: "warning",
		});
	}
}

function downloadMachineKey() {
	if (!created.value?.machineKey) return;
	// Zitadel returns the JSON key file base64-encoded.
	const blob = new Blob([atob(created.value.machineKey)], { type: "application/json" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = `${state.userName || "machine"}-key.json`;
	link.click();
	URL.revokeObjectURL(link.href);
}

async function onCredentialsDialogClose() {
	const instanceId = created.value?.instanceId;
	created.value = null;
	if (instanceId) await navigateTo(`/dashboard/instances/${instanceId}`);
}

const rowClass = "flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col";
const rowUi = { root: "w-full sm:w-auto", container: "w-full sm:w-auto" };
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader
				icon="i-lucide-server"
				:breadcrumb-items="[{ label: 'Instances', to: '/dashboard/instances' }, { label: 'New Instance' }]"
			/>
		</template>

		<template #body>
			<div class="mx-auto w-full space-y-6 lg:w-3xl">
				<div>
					<h2 class="text-xl font-semibold text-white">Create New Instance</h2>
					<p class="mt-1 text-sm text-slate-400">
						Provision a Zitadel virtual instance with its first organization and owner.
					</p>
				</div>

				<UForm
					:schema="schema"
					:state="state"
					:validate="validate"
					class="space-y-6"
					@submit="onSubmit"
					@error="onError"
				>
					<DashboardSectionCard
						title="Instance"
						description="Name, first organization and domain"
						icon="i-lucide-server"
					>
						<div class="divide-y divide-slate-800">
							<UFormField
								name="instanceName"
								label="Instance name"
								description="Shown in the console and the instance list."
								required
								:class="rowClass"
								:ui="rowUi"
							>
								<UInput v-model="state.instanceName" placeholder="Acme Corp" class="w-full sm:w-80" />
							</UFormField>

							<UFormField
								name="firstOrgName"
								label="First organization"
								description="Defaults to the instance name."
								:class="rowClass"
								:ui="rowUi"
							>
								<UInput v-model="state.firstOrgName" placeholder="Acme" class="w-full sm:w-80" />
							</UFormField>

							<UFormField
								name="customDomain"
								label="Custom domain"
								description="Optional — a generated domain is always added."
								:class="rowClass"
								:ui="rowUi"
							>
								<UInput
									v-model="state.customDomain"
									placeholder="login.acme.com"
									icon="i-lucide-globe"
									class="w-full sm:w-80"
								/>
							</UFormField>

							<UFormField
								name="defaultLanguage"
								label="Default language"
								description="Language of the login UI and emails."
								:class="rowClass"
								:ui="rowUi"
							>
								<USelect v-model="state.defaultLanguage" :items="languages" class="w-full sm:w-80" />
							</UFormField>
						</div>
					</DashboardSectionCard>

					<DashboardSectionCard
						title="Owner"
						description="The first user of the instance, with IAM owner rights"
						icon="i-lucide-user-cog"
					>
						<div class="divide-y divide-slate-800">
							<UFormField
								name="ownerType"
								label="Owner type"
								:class="rowClass"
								:ui="rowUi"
							>
								<URadioGroup
									v-model="state.ownerType"
									:items="ownerTypes"
									orientation="horizontal"
									variant="card"
									class="w-full sm:w-80"
								/>
							</UFormField>

							<UFormField
								name="userName"
								label="Username"
								required
								:class="rowClass"
								:ui="rowUi"
							>
								<UInput v-model="state.userName" placeholder="admin" class="w-full sm:w-80" />
							</UFormField>

							<template v-if="state.ownerType === 'human'">
								<UFormField name="email" label="Email" required :class="rowClass" :ui="rowUi">
									<UInput
										v-model="state.email"
										type="email"
										placeholder="admin@acme.com"
										class="w-full sm:w-80"
									/>
								</UFormField>

								<UFormField name="firstName" label="First name" required :class="rowClass" :ui="rowUi">
									<UInput v-model="state.firstName" class="w-full sm:w-80" />
								</UFormField>

								<UFormField name="lastName" label="Last name" required :class="rowClass" :ui="rowUi">
									<UInput v-model="state.lastName" class="w-full sm:w-80" />
								</UFormField>

								<UFormField
									name="password"
									label="Initial password"
									description="Must satisfy the instance's password policy."
									required
									:class="rowClass"
									:ui="rowUi"
								>
									<UInput v-model="state.password" type="password" class="w-full sm:w-80" />
								</UFormField>

								<UFormField
									name="passwordChangeRequired"
									label="Require password change"
									description="Ask the owner to set a new password on first login."
									:class="rowClass"
									:ui="rowUi"
								>
									<USwitch v-model="state.passwordChangeRequired" />
								</UFormField>
							</template>

							<template v-else>
								<UFormField name="machineName" label="Name" required :class="rowClass" :ui="rowUi">
									<UInput v-model="state.machineName" placeholder="Provisioning" class="w-full sm:w-80" />
								</UFormField>

								<UFormField
									name="createPat"
									label="Personal access token"
									description="Returned once after creation."
									:class="rowClass"
									:ui="rowUi"
								>
									<USwitch v-model="state.createPat" />
								</UFormField>

								<UFormField
									name="createMachineKey"
									label="JSON machine key"
									description="Returned once after creation."
									:class="rowClass"
									:ui="rowUi"
								>
									<USwitch v-model="state.createMachineKey" />
								</UFormField>
							</template>
						</div>
					</DashboardSectionCard>

					<UAlert
						color="primary"
						variant="subtle"
						icon="i-lucide-palette"
						title="LAVIAC default branding"
						description="After creation a background task applies the LeiCraft_MC branding: dark theme only, #020719 background, #0392CA primary, #FF6467 warning, white text, the Rubik font and no Zitadel watermark."
					/>

					<div class="flex justify-end gap-2">
						<UButton label="Cancel" color="neutral" variant="ghost" to="/dashboard/instances" />
						<UButton
							label="Create Instance"
							type="submit"
							icon="i-lucide-plus-circle"
							:loading="creating"
						/>
					</div>
				</UForm>
			</div>

			<!-- One-time owner credentials -->
			<DashboardModal
				:open="!!created"
				title="Instance Created"
				description="Copy the owner credentials now. You won't be able to see them again."
				icon="i-lucide-check-circle"
				icon-color="emerald"
				:dismissible="false"
				:close="false"
			>
				<div class="space-y-4">
					<div class="rounded-lg border border-red-900/50 bg-red-950/50 p-4">
						<p class="text-sm text-red-300">
							<strong>Warning:</strong>
							These credentials are only shown once. Store them somewhere safe.
						</p>
					</div>

					<UFormField v-if="created?.pat" label="Personal access token">
						<UInput :model-value="created.pat" readonly type="password" class="w-full" :ui="{ trailing: 'pe-1' }">
							<template #trailing>
								<UButton
									color="neutral"
									variant="link"
									size="sm"
									icon="i-lucide-copy"
									aria-label="Copy token"
									@click="copy(created?.pat)"
								/>
							</template>
						</UInput>
					</UFormField>

					<UFormField v-if="created?.machineKey" label="Machine key">
						<UButton
							label="Download JSON key"
							icon="i-lucide-download"
							color="neutral"
							variant="soft"
							@click="downloadMachineKey"
						/>
					</UFormField>
				</div>

				<template #footer>
					<UButton label="Done" color="primary" @click="onCredentialsDialogClose" />
				</template>
			</DashboardModal>
		</template>
	</UDashboardPanel>
</template>
