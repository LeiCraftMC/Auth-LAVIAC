<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import * as z from "zod";
import { zPostInstancesBody } from "~/api-client/zod.gen";
import type { CreatedInstance, InstanceTemplates, NewInstance, TemplateId } from "~/utils/types";

definePageMeta({
	layout: "dashboard",
});

useSeoMeta({
	title: "New Instance | LAVIAC",
	description: "Provision a new Zitadel instance from a template",
});

const route = useRoute();
const toast = useToast();
const onError = await useDefaultOnFormError();

const templates = await useAPIAsyncData<InstanceTemplates | null>(
	"instance-templates",
	async () => {
		const res = await useAPI((api) => api.getInstanceTemplates({}));
		if (!res.success) {
			toast.add({ title: "Failed to load the templates", description: res.message, color: "error" });
			return null;
		}
		return res.data;
	},
);

const templateList = computed(() => templates.data.value?.templates ?? []);
const systemOrgName = computed(() => templates.data.value?.systemOrgName ?? "SYSTEM");
const initialAdminUserName = computed(
	() => templates.data.value?.initialAdminUserName ?? "initial-admin",
);

// The API's rule for the home org domain (TemplateData.Options), from the generated schema.
const homeOrgDomainSchema = zPostInstancesBody.shape.templateOptions.unwrap().unwrap()
	.shape.homeOrgDomain;

// The form is flat; `onSubmit` builds the nested `templateOptions` and `human` | `machine` body.
const schema = z.object({
	instanceName: z.string("Instance name is required").trim().min(1, "Instance name is required"),
	customDomain: z.string().optional(),
	defaultLanguage: z.string(),
	template: z.custom<TemplateId>((value) => typeof value === "string" && value.length > 0, {
		message: "Pick a template",
	}),
	homeOrgName: z.string().optional(),
	homeOrgDomain: z.string().optional(),
	allowOrgRegistration: z.boolean(),
	ownerType: z.enum(["generated", "human", "machine"]),
	userName: z.string().optional(),
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

const requestedTemplate = route.query.template as TemplateId | undefined;

const state = reactive<Schema>({
	instanceName: "",
	customDomain: "",
	defaultLanguage: "en",
	template: templateList.value.some((t) => t.id === requestedTemplate)
		? (requestedTemplate as TemplateId)
		: "private",
	homeOrgName: "",
	homeOrgDomain: "",
	allowOrgRegistration: false,
	ownerType: "generated",
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

const selectedTemplate = computed(
	() => templateList.value.find((template) => template.id === state.template) ?? null,
);

const initialAdminNotice = computed(
	() =>
		`It is created in the ${systemOrgName.value} org, which holds Zitadel's own project and is not meant for users. Use it to set up the instance, then create admin accounts in your home org, give them IAM owner rights and remove or deactivate this one.`,
);

// The baseline password policy (server/lib/zitadel/templates.ts) asks for 12 characters.
const MIN_PASSWORD_LENGTH = 12;

function validate(form: Partial<Schema>): FormError[] {
	const errors: FormError[] = [];

	const homeOrg = selectedTemplate.value?.homeOrg;
	if (homeOrg) {
		const name = form.homeOrgName?.trim() ?? "";
		if (!name) {
			errors.push({
				name: "homeOrgName",
				message: `A name for the ${homeOrg.label.toLowerCase()} is required`,
			});
		} else if (name.toUpperCase() === systemOrgName.value) {
			errors.push({
				name: "homeOrgName",
				message: `"${systemOrgName.value}" is reserved for the first org`,
			});
		}

		const domain = form.homeOrgDomain?.trim().toLowerCase();
		if (domain && !homeOrgDomainSchema.safeParse(domain).success) {
			errors.push({ name: "homeOrgDomain", message: "Must be a domain name like users.example.com" });
		}
	}

	if (form.ownerType !== "generated" && !form.userName?.trim()) {
		errors.push({ name: "userName", message: "Username is required" });
	}

	if (form.ownerType === "human") {
		if (!z.email().safeParse(form.email ?? "").success) {
			errors.push({ name: "email", message: "A valid email is required" });
		}
		if (!form.firstName?.trim())
			errors.push({ name: "firstName", message: "First name is required" });
		if (!form.lastName?.trim()) errors.push({ name: "lastName", message: "Last name is required" });
		if (!form.password) {
			errors.push({ name: "password", message: "An initial password is required" });
		} else if (form.password.length < MIN_PASSWORD_LENGTH) {
			errors.push({
				name: "password",
				message: `At least ${MIN_PASSWORD_LENGTH} characters`,
			});
		}
	} else if (form.ownerType === "machine" && !form.machineName?.trim()) {
		errors.push({ name: "machineName", message: "Name is required" });
	}
	return errors;
}

const ownerTypes = [
	{
		label: "Generated (recommended)",
		value: "generated",
		description: "A one-time human admin; the password is shown once",
	},
	{ label: "Human user", value: "human", description: "Enter the admin's details" },
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
const showPassword = ref(false);

async function onSubmit(event: FormSubmitEvent<Schema>) {
	const form = event.data;

	const template = selectedTemplate.value;
	const body: NewInstance = {
		instanceName: form.instanceName,
		customDomain: form.customDomain || undefined,
		defaultLanguage: form.defaultLanguage,
		template: form.template,
		templateOptions: {
			homeOrgName: template?.homeOrg ? form.homeOrgName?.trim() : undefined,
			homeOrgDomain: template?.homeOrg
				? form.homeOrgDomain?.trim().toLowerCase() || undefined
				: undefined,
			allowOrgRegistration: template?.asksOrgRegistration ? form.allowOrgRegistration : undefined,
		},
	};

	// "generated": neither `human` nor `machine` — LAVIAC creates the initial admin.
	if (form.ownerType === "human") {
		body.human = {
			userName: form.userName ?? "",
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
	} else if (form.ownerType === "machine") {
		body.machine = {
			userName: form.userName ?? "",
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

	const background = [
		result.data.provisioningTaskId !== null && `the ${template?.name ?? "template"} template`,
		result.data.brandingTaskId !== null && "the LAVIAC default branding",
	].filter(Boolean);
	toast.add({
		title: "Instance created",
		description: background.length
			? `Applying ${background.join(" and ")} in the background.`
			: undefined,
		icon: "i-lucide-check",
		color: "success",
	});
	if (!result.data.templateSaved) {
		toast.add({
			title: "The template could not be saved",
			description:
				"LAVIAC can't apply it to this instance. Configure the instance in the Zitadel Console or delete and recreate it.",
			icon: "i-lucide-alert-triangle",
			color: "error",
		});
	} else if (result.data.provisioningTaskId === null) {
		toast.add({
			title: "The template could not be queued",
			description: "Apply it from the instance's Template page.",
			icon: "i-lucide-alert-triangle",
			color: "warning",
		});
	}

	// Owner credentials are returned exactly once — show them before leaving the page.
	if (result.data.initialAdmin || result.data.pat || result.data.machineKey) {
		created.value = result.data;
		return;
	}

	await navigateTo(`/dashboard/instances/${result.data.instanceId}/template`);
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
	showPassword.value = false;
	if (instanceId) await navigateTo(`/dashboard/instances/${instanceId}/template`);
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
						Provision a Zitadel virtual instance from a template, with its initial admin.
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
						description="Name, domain and language"
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
						title="Template"
						description="Organizations, sign-in and the security baseline"
						icon="i-lucide-layout-template"
					>
						<template #actions>
							<UButton
								label="All Settings"
								icon="i-lucide-external-link"
								color="neutral"
								variant="ghost"
								size="sm"
								:to="`/dashboard/templates?template=${state.template}`"
								target="_blank"
							/>
						</template>

						<div class="divide-y divide-slate-800">
							<UFormField name="template" class="pb-4">
								<InstanceTemplatePicker v-model="state.template" :templates="templateList" />
							</UFormField>

							<template v-if="selectedTemplate?.homeOrg">
								<UFormField
									name="homeOrgName"
									:label="selectedTemplate.homeOrg.label"
									:description="`${selectedTemplate.homeOrg.description} Becomes the default org.`"
									required
									:class="rowClass"
									:ui="rowUi"
								>
									<UInput
										v-model="state.homeOrgName"
										:placeholder="selectedTemplate.homeOrg.placeholder"
										class="w-full sm:w-80"
									/>
								</UFormField>

								<UFormField
									name="homeOrgDomain"
									:label="`${selectedTemplate.homeOrg.label} domain`"
									description="Optional. Added as the org's verified primary domain without a DNS check."
									:class="rowClass"
									:ui="rowUi"
								>
									<UInput
										v-model="state.homeOrgDomain"
										placeholder="users.example.com"
										icon="i-lucide-globe"
										class="w-full sm:w-80"
									/>
								</UFormField>
							</template>

							<UFormField
								v-if="selectedTemplate?.asksOrgRegistration"
								name="allowOrgRegistration"
								label="Org self-registration"
								description="Lets anyone create a business org on the Login V1 page /ui/login/register/org. Login V2 has no org sign-up."
								:class="rowClass"
								:ui="rowUi"
							>
								<USwitch v-model="state.allowOrgRegistration" />
							</UFormField>
						</div>
					</DashboardSectionCard>

					<DashboardSectionCard
						title="Initial Admin"
						description="The instance's first user, with IAM owner rights"
						icon="i-lucide-user-cog"
					>
						<UAlert
							color="warning"
							variant="subtle"
							icon="i-lucide-info"
							title="This is the initial admin"
							:description="initialAdminNotice"
							class="mb-4"
						/>

						<div class="divide-y divide-slate-800">
							<UFormField name="ownerType" label="Account" class="pb-4">
								<URadioGroup
									v-model="state.ownerType"
									:items="ownerTypes"
									variant="card"
									:ui="{ fieldset: 'mt-2 grid gap-3 sm:grid-cols-3' }"
								/>
							</UFormField>

							<p v-if="state.ownerType === 'generated'" class="py-4 text-sm text-slate-400">
								LAVIAC creates the user
								<span class="font-mono text-slate-200">{{ initialAdminUserName }}</span>
								with a random password and no real email address. The password is shown once after
								creation and doesn't have to be changed at the first sign-in.
							</p>

							<UFormField
								v-else
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
									description="At least 12 characters with upper- and lowercase letters, a number and a symbol."
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

							<template v-else-if="state.ownerType === 'machine'">
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

					<template v-if="created?.initialAdmin">
						<UFormField label="Username" description="Sign in to the instance's Console with these.">
							<UInput
								:model-value="created.initialAdmin.userName"
								readonly
								class="w-full font-mono"
								:ui="{ trailing: 'pe-1' }"
							>
								<template #trailing>
									<UButton
										color="neutral"
										variant="link"
										size="sm"
										icon="i-lucide-copy"
										aria-label="Copy username"
										@click="copy(created?.initialAdmin?.userName)"
									/>
								</template>
							</UInput>
						</UFormField>

						<UFormField label="Password">
							<UInput
								:model-value="created.initialAdmin.password"
								readonly
								:type="showPassword ? 'text' : 'password'"
								class="w-full font-mono"
								:ui="{ trailing: 'pe-1' }"
							>
								<template #trailing>
									<UButton
										color="neutral"
										variant="link"
										size="sm"
										:icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
										:aria-label="showPassword ? 'Hide password' : 'Show password'"
										@click="showPassword = !showPassword"
									/>
									<UButton
										color="neutral"
										variant="link"
										size="sm"
										icon="i-lucide-copy"
										aria-label="Copy password"
										@click="copy(created?.initialAdmin?.password)"
									/>
								</template>
							</UInput>
						</UFormField>
					</template>

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
