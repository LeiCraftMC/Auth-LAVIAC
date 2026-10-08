/**
 * InstanceTemplates — the settings LAVIAC gives a new virtual instance, apart from the branding
 * (./branding.ts, applied by its own task and unaffected by the template).
 *
 * Every instance is created with a first org named `SYSTEM`: Zitadel puts the ZITADEL project,
 * the Console app and the initial admin there. The template then decides which org becomes the
 * default org (the "home org": company, public or catch-all) and how sign-in works. The security
 * baseline ({@link InstanceTemplates.BASELINE}) is the same for every template.
 *
 * {@link InstanceTemplates.resolve} turns a template and its creation options into a
 * {@link InstanceTemplates.Plan}: the exact Zitadel payloads the `provisionInstance` task writes
 * (server/lib/tasks/provisionInstance.ts). {@link InstanceTemplates.describe} renders the same
 * plan as readable rows for the dashboard, so what is shown is what is applied.
 *
 * Checked against Zitadel v4.19.4 with Login V2:
 * - Login V2 reads the default org's login settings when a request has no org, and its sign-up
 *   page registers users into the default org (apps/login/src/app/(login)/register/page.tsx).
 * - Org self-registration exists only on the Login V1 page `/ui/login/register/org`, which Zitadel
 *   still serves next to Login V2; `disallowPublicOrgRegistration` closes it.
 * - A locked user stays locked until an admin unlocks it; there is no lockout duration.
 */
import type {
	ZitadelCustomLoginPolicy,
	ZitadelDomainPolicy,
	ZitadelLockoutPolicy,
	ZitadelLoginPolicy,
	ZitadelOIDCSettings,
	ZitadelPasswordComplexityPolicy,
	ZitadelRestrictions,
	ZitadelSecurityPolicy,
} from "./types";

export namespace InstanceTemplates {
	export const IDS = ["private", "public-b2b-b2c", "public-b2c", "public-b2b", "minimal"] as const;
	export type Id = (typeof IDS)[number];

	/** Name of the first org of every instance, fixed at creation. */
	export const SYSTEM_ORG_NAME = "SYSTEM";
	/** Org metadata key marking what LAVIAC created an org for (an {@link OrgRole}). */
	export const ORG_ROLE_METADATA_KEY = "laviac.org.role";

	export type HomeOrgKind = "company" | "public" | "catch-all";
	export type OrgRole = "system" | HomeOrgKind;

	/** Chosen when the instance is created. */
	export interface Options {
		/** Name of the home org; required by every template except Minimal. */
		homeOrgName?: string;
		/** Domain added to the home org as its verified primary domain. */
		homeOrgDomain?: string;
		/** B2B templates only: open the org sign-up page. */
		allowOrgRegistration?: boolean;
	}

	export interface Definition {
		id: Id;
		name: string;
		summary: string;
		icon: string;
		homeOrg: {
			kind: HomeOrgKind;
			label: string;
			description: string;
			placeholder: string;
		} | null;
		/** Whether creation asks for {@link Options.allowOrgRegistration}. */
		asksOrgRegistration: boolean;
	}

	export interface OrgPlan {
		role: OrgRole;
		name: string;
		/** Added verified and made primary; `null` keeps the generated domain. */
		domain: string | null;
		/** The org's own login policy; `null` inherits the instance default. */
		loginPolicy: ZitadelCustomLoginPolicy | null;
		/** The org's own domain policy; `null` inherits the instance default. */
		domainPolicy: ZitadelDomainPolicy | null;
	}

	export interface Plan {
		template: Id;
		instance: {
			loginPolicy: ZitadelLoginPolicy;
			domainPolicy: ZitadelDomainPolicy;
			passwordComplexity: ZitadelPasswordComplexityPolicy;
			lockout: ZitadelLockoutPolicy;
			security: ZitadelSecurityPolicy;
			oidc: ZitadelOIDCSettings;
			restrictions: ZitadelRestrictions;
		};
		systemOrg: OrgPlan;
		/** Becomes the default org; `null` leaves the SYSTEM org as default. */
		homeOrg: OrgPlan | null;
	}

	export type SettingSource = "baseline" | "template" | "option";

	export interface SettingRow {
		label: string;
		value: string;
		source: SettingSource;
	}

	export interface SettingSection {
		id: string;
		title: string;
		description: string;
		rows: SettingRow[];
	}
}

/** The login policy fields a template decides; everything else comes from the baseline. */
type LoginPolicyChoices = Pick<
	ZitadelLoginPolicy,
	"allowRegister" | "allowExternalIdp" | "forceMfa" | "forceMfaLocalOnly" | "allowDomainDiscovery"
>;

interface TemplateSpec {
	definition: InstanceTemplates.Definition;
	instanceLogin: LoginPolicyChoices;
	/** `userLoginMustBeDomain` of the instance default domain policy. */
	loginNameSuffix: boolean;
	/** The home org's own login policy; `null` inherits the instance default. */
	homeOrgLogin: LoginPolicyChoices | null;
}

export namespace InstanceTemplates {
	/** The security baseline, identical for every template. */
	export const BASELINE = {
		/** Shared by the instance default and every org login policy LAVIAC writes. */
		loginPolicy: {
			allowUsernamePassword: true,
			passwordlessType: "PASSWORDLESS_TYPE_ALLOWED",
			hidePasswordReset: false,
			// Same answer for unknown and known usernames (no user enumeration).
			ignoreUnknownUsernames: true,
			defaultRedirectUri: "",
			disableLoginWithEmail: false,
			disableLoginWithPhone: true,
			// Zitadel's defaults (cmd/defaults.yaml); a PUT must send them all.
			passwordCheckLifetime: "864000s",
			externalLoginCheckLifetime: "864000s",
			mfaInitSkipLifetime: "2592000s",
			secondFactorCheckLifetime: "64800s",
			multiFactorCheckLifetime: "43200s",
		},
		/** Factors of every org login policy LAVIAC adds; the same as Zitadel's instance default. */
		secondFactors: ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_U2F"],
		multiFactors: ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"],
		domainPolicy: {
			validateOrgDomains: true,
			smtpSenderAddressMatchesInstanceDomain: false,
		},
		passwordComplexity: {
			minLength: 12,
			hasUppercase: true,
			hasLowercase: true,
			hasNumber: true,
			hasSymbol: true,
		},
		// No password lockout: it is permanent, so anyone knowing a username could lock the
		// account. OTP lockout only triggers after a correct password.
		lockout: {
			maxPasswordAttempts: 0,
			maxOtpAttempts: 5,
		},
		// No allowed origins either (set in resolve()).
		security: {
			enableIframeEmbedding: false,
			enableImpersonation: false,
		},
		oidc: {
			accessTokenLifetime: "3600s",
			idTokenLifetime: "3600s",
			refreshTokenIdleExpiration: "2592000s",
			refreshTokenExpiration: "7776000s",
		},
		/** The SYSTEM org: no sign-up, no external IdPs, MFA for everyone, plain login names. */
		systemOrgLogin: {
			allowRegister: false,
			allowExternalIdp: false,
			forceMfa: true,
			forceMfaLocalOnly: false,
			allowDomainDiscovery: false,
		},
	} as const satisfies {
		loginPolicy: Omit<ZitadelLoginPolicy, keyof LoginPolicyChoices>;
		secondFactors: readonly ZitadelCustomLoginPolicy["secondFactors"][number][];
		multiFactors: readonly ZitadelCustomLoginPolicy["multiFactors"][number][];
		domainPolicy: Omit<ZitadelDomainPolicy, "userLoginMustBeDomain">;
		passwordComplexity: ZitadelPasswordComplexityPolicy;
		lockout: ZitadelLockoutPolicy;
		security: Omit<ZitadelSecurityPolicy, "allowedOrigins">;
		oidc: ZitadelOIDCSettings;
		systemOrgLogin: LoginPolicyChoices;
	};
}

const PUBLIC_ORG = {
	kind: "public",
	label: "Public org",
	description: "Default org for the public users. Anyone can sign up here.",
	placeholder: "LeiCraft_MC",
} as const;

const PUBLIC_ORG_LOGIN: LoginPolicyChoices = {
	allowRegister: true,
	allowExternalIdp: true,
	forceMfa: false,
	forceMfaLocalOnly: false,
	allowDomainDiscovery: false,
};

/** Instance defaults of the public templates: what every new B2B org inherits. */
const B2B_ORG_LOGIN: LoginPolicyChoices = {
	allowRegister: false,
	allowExternalIdp: true,
	forceMfa: false,
	forceMfaLocalOnly: false,
	allowDomainDiscovery: true,
};

const TEMPLATES: Record<InstanceTemplates.Id, TemplateSpec> = {
	private: {
		definition: {
			id: "private",
			name: "Private",
			summary:
				"One company's workforce directory, like Entra ID, Google Workspace or Okta. No self-registration, MFA required, plain login names.",
			icon: "i-lucide-building-2",
			homeOrg: {
				kind: "company",
				label: "Company org",
				description: "Default org where the company's members live.",
				placeholder: "Acme",
			},
			asksOrgRegistration: false,
		},
		instanceLogin: {
			allowRegister: false,
			allowExternalIdp: true,
			forceMfa: true,
			// Users coming from the company's own IdP (e.g. Entra ID) did their MFA there.
			forceMfaLocalOnly: true,
			allowDomainDiscovery: true,
		},
		loginNameSuffix: false,
		homeOrgLogin: null,
	},
	"public-b2b-b2c": {
		definition: {
			id: "public-b2b-b2c",
			name: "Public B2B & B2C",
			summary:
				"Public users sign up in the default org; business customers get their own orgs, which inherit the instance defaults (no sign-up).",
			icon: "i-lucide-globe",
			homeOrg: PUBLIC_ORG,
			asksOrgRegistration: true,
		},
		instanceLogin: B2B_ORG_LOGIN,
		loginNameSuffix: true,
		homeOrgLogin: PUBLIC_ORG_LOGIN,
	},
	"public-b2c": {
		definition: {
			id: "public-b2c",
			name: "Public B2C only",
			summary:
				"Public users sign up in the default org. No business orgs: org sign-up stays closed and domain discovery is off.",
			icon: "i-lucide-users",
			homeOrg: PUBLIC_ORG,
			asksOrgRegistration: false,
		},
		instanceLogin: { ...B2B_ORG_LOGIN, allowDomainDiscovery: false },
		loginNameSuffix: true,
		homeOrgLogin: PUBLIC_ORG_LOGIN,
	},
	"public-b2b": {
		definition: {
			id: "public-b2b",
			name: "Public B2B only",
			summary:
				"Business customers get their own orgs. The default org is a catch-all for the login page and its branding, without sign-up.",
			icon: "i-lucide-briefcase",
			homeOrg: {
				kind: "catch-all",
				label: "Catch-all org",
				description:
					"Default org the login page uses before it knows the user's org. Nobody signs up here.",
				placeholder: "LeiCraft_MC",
			},
			asksOrgRegistration: true,
		},
		instanceLogin: B2B_ORG_LOGIN,
		loginNameSuffix: true,
		homeOrgLogin: null,
	},
	minimal: {
		definition: {
			id: "minimal",
			name: "Minimal",
			summary:
				"Only the SYSTEM org and the security baseline, for setups you configure by hand. The SYSTEM org stays the default org.",
			icon: "i-lucide-square-dashed",
			homeOrg: null,
			asksOrgRegistration: false,
		},
		instanceLogin: B2B_ORG_LOGIN,
		loginNameSuffix: false,
		homeOrgLogin: null,
	},
};

function loginPolicy(choices: LoginPolicyChoices): ZitadelLoginPolicy {
	return { ...InstanceTemplates.BASELINE.loginPolicy, ...choices };
}

function orgLoginPolicy(choices: LoginPolicyChoices): ZitadelCustomLoginPolicy {
	return {
		...loginPolicy(choices),
		secondFactors: [...InstanceTemplates.BASELINE.secondFactors],
		multiFactors: [...InstanceTemplates.BASELINE.multiFactors],
	};
}

function formatDuration(duration: string) {
	const seconds = Number.parseInt(duration, 10);
	const [amount, unit] = seconds % 86400 === 0 ? [seconds / 86400, "day"] : [seconds / 3600, "hour"];
	return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

const onOff = (value: boolean) => (value ? "On" : "Off");
const allowed = (value: boolean) => (value ? "Allowed" : "Off");

function mfaLabel(policy: LoginPolicyChoices) {
	if (!policy.forceMfa) return "Optional";
	return policy.forceMfaLocalOnly ? "Required for local sign-ins" : "Required";
}

/** The template-decided login fields as rows. */
function loginChoiceRows(
	policy: LoginPolicyChoices,
	source: InstanceTemplates.SettingSource,
): InstanceTemplates.SettingRow[] {
	return [
		{ label: "Self-registration", value: allowed(policy.allowRegister), source },
		{ label: "External identity providers", value: allowed(policy.allowExternalIdp), source },
		{ label: "Multi-factor authentication", value: mfaLabel(policy), source },
		{ label: "Domain discovery", value: onOff(policy.allowDomainDiscovery), source },
	];
}

export namespace InstanceTemplates {
	export function isId(value: string): value is Id {
		return (IDS as readonly string[]).includes(value);
	}

	export function definition(id: Id): Definition {
		return TEMPLATES[id].definition;
	}

	export function list(): Definition[] {
		return IDS.map(definition);
	}

	/** The exact settings the provisioning task writes for `id` with `options`. */
	export function resolve(id: Id, options: Options): Plan {
		const spec = TEMPLATES[id];
		const homeOrgName = options.homeOrgName?.trim();
		if (spec.definition.homeOrg && !homeOrgName) {
			throw new Error(`The ${spec.definition.name} template needs a home org name`);
		}

		const orgRegistrationOpen =
			spec.definition.asksOrgRegistration && options.allowOrgRegistration === true;

		return {
			template: id,
			instance: {
				loginPolicy: loginPolicy(spec.instanceLogin),
				domainPolicy: {
					userLoginMustBeDomain: spec.loginNameSuffix,
					...BASELINE.domainPolicy,
				},
				passwordComplexity: { ...BASELINE.passwordComplexity },
				lockout: { ...BASELINE.lockout },
				security: { ...BASELINE.security, allowedOrigins: [] },
				oidc: { ...BASELINE.oidc },
				restrictions: { disallowPublicOrgRegistration: !orgRegistrationOpen },
			},
			systemOrg: {
				role: "system",
				name: SYSTEM_ORG_NAME,
				domain: null,
				loginPolicy: orgLoginPolicy(BASELINE.systemOrgLogin),
				// Plain login names: the initial admin keeps signing in with the username it was
				// created with, whatever suffix setting the template gives the instance.
				domainPolicy: { userLoginMustBeDomain: false, ...BASELINE.domainPolicy },
			},
			homeOrg:
				spec.definition.homeOrg && homeOrgName
					? {
							role: spec.definition.homeOrg.kind,
							name: homeOrgName,
							domain: options.homeOrgDomain?.trim().toLowerCase() || null,
							loginPolicy: spec.homeOrgLogin ? orgLoginPolicy(spec.homeOrgLogin) : null,
							domainPolicy: null,
						}
					: null,
		};
	}

	/**
	 * The plan as readable sections. Without `options` (the template overview), values chosen
	 * at creation read "Chosen at creation".
	 */
	export function describe(id: Id, options: Options | null): SettingSection[] {
		const spec = TEMPLATES[id];
		const def = spec.definition;
		const plan = resolve(id, {
			...options,
			homeOrgName: options?.homeOrgName ?? def.homeOrg?.placeholder,
		});
		const chosen = (value: string) => (options ? value : "Chosen at creation");
		const instanceLogin = plan.instance.loginPolicy;

		const sections: SettingSection[] = [];

		sections.push({
			id: "orgs",
			title: "Organizations",
			description: "The orgs LAVIAC sets up, and which one is the default org.",
			rows: [
				{
					label: "SYSTEM org",
					value:
						"First org: the ZITADEL project, the Console and the initial admin. Locked down, not for users.",
					source: "baseline",
				},
				...(def.homeOrg && plan.homeOrg
					? [
							{
								label: def.homeOrg.label,
								value: chosen(plan.homeOrg.name),
								source: "option" as const,
							},
							{
								label: "Default org",
								value: `${def.homeOrg.label} (the SYSTEM org stops being the default)`,
								source: "template" as const,
							},
							{
								label: `${def.homeOrg.label} domain`,
								value: options
									? (plan.homeOrg.domain ?? "None (generated domain only)")
									: "Optional, chosen at creation",
								source: "option" as const,
							},
						]
					: [{ label: "Default org", value: "SYSTEM org", source: "template" as const }]),
			],
		});

		sections.push({
			id: "instance-login",
			title: "Sign-in defaults (instance)",
			description: "The instance's login policy. Every org without its own policy inherits it.",
			rows: [
				...loginChoiceRows(instanceLogin, "template"),
				{
					label: "Username and password",
					value: allowed(instanceLogin.allowUsernamePassword),
					source: "baseline",
				},
				{
					label: "Passkeys (passwordless)",
					value: allowed(instanceLogin.passwordlessType === "PASSWORDLESS_TYPE_ALLOWED"),
					source: "baseline",
				},
				{
					label: "Hide whether a username exists",
					value: onOff(instanceLogin.ignoreUnknownUsernames),
					source: "baseline",
				},
				{
					label: "Sign in with email address",
					value: allowed(!instanceLogin.disableLoginWithEmail),
					source: "baseline",
				},
				{
					label: "Sign in with phone number",
					value: allowed(!instanceLogin.disableLoginWithPhone),
					source: "baseline",
				},
				{
					label: "Password reset link",
					value: instanceLogin.hidePasswordReset ? "Hidden" : "Shown",
					source: "baseline",
				},
				{
					label: "Password check valid for",
					value: formatDuration(instanceLogin.passwordCheckLifetime),
					source: "baseline",
				},
				{
					label: "External login check valid for",
					value: formatDuration(instanceLogin.externalLoginCheckLifetime),
					source: "baseline",
				},
				{
					label: "MFA setup can be skipped for",
					value: formatDuration(instanceLogin.mfaInitSkipLifetime),
					source: "baseline",
				},
				{
					label: "Second factor check valid for",
					value: formatDuration(instanceLogin.secondFactorCheckLifetime),
					source: "baseline",
				},
				{
					label: "Multi-factor check valid for",
					value: formatDuration(instanceLogin.multiFactorCheckLifetime),
					source: "baseline",
				},
			],
		});

		const factorRows: SettingRow[] = [
			{ label: "Second factors", value: "Authenticator app (TOTP), security key", source: "baseline" },
			{ label: "Multi-factors", value: "Security key with PIN", source: "baseline" },
		];

		if (def.homeOrg && plan.homeOrg?.loginPolicy) {
			sections.push({
				id: "home-org-login",
				title: `Sign-in: ${def.homeOrg.label.toLowerCase()} (own policy)`,
				description: "The org's own login policy. Its other fields match the instance defaults above.",
				rows: [...loginChoiceRows(plan.homeOrg.loginPolicy, "template"), ...factorRows],
			});
		}

		sections.push({
			id: "system-org-login",
			title: "Sign-in: SYSTEM org (own policy)",
			description: "The org's own login policy. Its other fields match the instance defaults above.",
			rows: plan.systemOrg.loginPolicy
				? [...loginChoiceRows(plan.systemOrg.loginPolicy, "baseline"), ...factorRows]
				: [],
		});

		sections.push({
			id: "login-names",
			title: "Login names (domain policy)",
			description: "Whether login names carry the org domain (alice@<org domain>).",
			rows: [
				{
					label: "Org domain suffix on login names",
					value: plan.instance.domainPolicy.userLoginMustBeDomain
						? "On (alice@<org domain>)"
						: "Off (plain usernames, unique in the instance)",
					source: "template",
				},
				{
					label: "SYSTEM org suffix",
					value: "Off (own domain policy; the initial admin keeps its username)",
					source: "baseline",
				},
				{
					label: "Org domains must be verified",
					value: plan.instance.domainPolicy.validateOrgDomains ? "Yes (DNS or HTTP challenge)" : "No",
					source: "baseline",
				},
				{
					label: "SMTP sender must match an instance domain",
					value: plan.instance.domainPolicy.smtpSenderAddressMatchesInstanceDomain ? "Yes" : "No",
					source: "baseline",
				},
			],
		});

		const complexity = plan.instance.passwordComplexity;
		const lockout = plan.instance.lockout;
		const required = [
			complexity.hasUppercase && "uppercase",
			complexity.hasLowercase && "lowercase",
			complexity.hasNumber && "number",
			complexity.hasSymbol && "symbol",
		].filter(Boolean);
		sections.push({
			id: "passwords",
			title: "Passwords and lockout",
			description: "Password complexity and lockout policy of the instance.",
			rows: [
				{ label: "Minimum length", value: `${complexity.minLength} characters`, source: "baseline" },
				{
					label: "Required characters",
					value: required.length ? required.join(", ") : "None",
					source: "baseline",
				},
				{
					label: "Lock after wrong passwords",
					value: lockout.maxPasswordAttempts
						? `${lockout.maxPasswordAttempts} attempts`
						: "Off (a lock is permanent)",
					source: "baseline",
				},
				{
					label: "Lock after wrong one-time codes",
					value: lockout.maxOtpAttempts ? `${lockout.maxOtpAttempts} attempts` : "Off",
					source: "baseline",
				},
			],
		});

		const security = plan.instance.security;
		sections.push({
			id: "security",
			title: "Security policy",
			description: "Instance-wide security settings.",
			rows: [
				{
					label: "Embedding in iframes",
					value: allowed(security.enableIframeEmbedding),
					source: "baseline",
				},
				{ label: "Impersonation", value: allowed(security.enableImpersonation), source: "baseline" },
			],
		});

		const oidc = plan.instance.oidc;
		sections.push({
			id: "tokens",
			title: "Token lifetimes (OIDC)",
			description: "Apply to every app of the instance.",
			rows: [
				{ label: "Access token", value: formatDuration(oidc.accessTokenLifetime), source: "baseline" },
				{ label: "ID token", value: formatDuration(oidc.idTokenLifetime), source: "baseline" },
				{
					label: "Refresh token, idle",
					value: formatDuration(oidc.refreshTokenIdleExpiration),
					source: "baseline",
				},
				{
					label: "Refresh token, absolute",
					value: formatDuration(oidc.refreshTokenExpiration),
					source: "baseline",
				},
			],
		});

		const registrationOpen = !plan.instance.restrictions.disallowPublicOrgRegistration;
		sections.push({
			id: "org-registration",
			title: "Org self-registration",
			description:
				"The org sign-up page is part of the old Login V1 (/ui/login/register/org); Login V2 has none.",
			rows: [
				{
					label: "Org sign-up page",
					value: def.asksOrgRegistration
						? options
							? registrationOpen
								? "Open"
								: "Closed"
							: "Chosen at creation (default: closed)"
						: "Closed",
					source: def.asksOrgRegistration ? "option" : "template",
				},
			],
		});

		return sections;
	}
}
