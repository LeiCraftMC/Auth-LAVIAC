/**
 * Zitadel v1 System API — response types.
 * Source: https://zitadel.com/docs/reference/api/system (tag v4.17.1).
 * These describe the JSON returned by the System API REST gateway; the LAVIAC
 * route models re-shape them into the `{ success, code, message, data }` envelope.
 */

export interface ZitadelObjectDetails {
	sequence?: string;
	creationDate?: string;
	changeDate?: string;
	resourceOwner?: string;
}

export interface ZitadelListDetails {
	totalResult?: string;
	processedSequence?: string;
	viewTimestamp?: string;
}

export type ZitadelInstanceState =
	| "STATE_UNSPECIFIED"
	| "STATE_CREATING"
	| "STATE_RUNNING"
	| "STATE_DELETING"
	| "STATE_STOPPED";

export interface ZitadelDomain {
	details?: ZitadelObjectDetails;
	domain: string;
	primary?: boolean;
	generated?: boolean;
}

export interface ZitadelInstance {
	id: string;
	details?: ZitadelObjectDetails;
	state: ZitadelInstanceState;
	name: string;
	domains?: ZitadelDomain[];
	version?: string;
}

export interface ZitadelListInstancesResponse {
	details?: ZitadelListDetails;
	result?: ZitadelInstance[];
}

export interface ZitadelGetInstanceResponse {
	instance?: ZitadelInstance;
}

export interface ZitadelCreateInstanceResponse {
	instanceId: string;
	details?: ZitadelObjectDetails;
	pat?: string;
	machineKey?: string;
}

export interface ZitadelUpdateInstanceResponse {
	changeDate?: string;
}

export interface ZitadelDeleteInstanceResponse {
	deletionDate?: string;
}

export interface ZitadelListDomainsResponse {
	details?: ZitadelListDetails;
	result?: ZitadelDomain[];
}

export interface ZitadelExistsDomainResponse {
	exists: boolean;
}

// --- CreateInstance request body (oneof human | machine) ---------------------

export interface ZitadelHumanOwner {
	userName: string;
	email: { email: string; isEmailVerified?: boolean };
	profile: { firstName: string; lastName: string; preferredLanguage?: string };
	password: { password: string; passwordChangeRequired?: boolean };
}

export interface ZitadelMachineOwner {
	userName: string;
	name: string;
	personalAccessToken?: { expirationDate?: string };
	machineKey?: { type: string; expirationDate?: string };
}

export interface ZitadelCreateInstanceRequest {
	instanceName: string;
	firstOrgName?: string;
	customDomain?: string;
	defaultLanguage?: string;
	human?: ZitadelHumanOwner;
	machine?: ZitadelMachineOwner;
}

// --- Limits ------------------------------------------------------------------

export interface ZitadelSetLimitsRequest {
	auditLogRetention?: string;
	block?: boolean | null;
}

// --- Sorting columns for ListInstances ---------------------------------------

export type ZitadelInstanceSortingColumn =
	| "FIELD_NAME_UNSPECIFIED"
	| "FIELD_NAME_ID"
	| "FIELD_NAME_NAME"
	| "FIELD_NAME_CREATION_DATE";

// --- Admin API (instance-scoped, selected via the `x-zitadel-instance-host` header) -------

export type ZitadelThemeMode =
	| "THEME_MODE_UNSPECIFIED"
	| "THEME_MODE_AUTO"
	| "THEME_MODE_DARK"
	| "THEME_MODE_LIGHT";

/** Body of `PUT /admin/v1/policies/label` (the instance's default branding, preview state). */
export interface ZitadelUpdateLabelPolicyRequest {
	primaryColor?: string;
	hideLoginNameSuffix?: boolean;
	warnColor?: string;
	backgroundColor?: string;
	fontColor?: string;
	primaryColorDark?: string;
	backgroundColorDark?: string;
	warnColorDark?: string;
	fontColorDark?: string;
	disableWatermark?: boolean;
	themeMode?: ZitadelThemeMode;
}

export interface ZitadelLabelPolicy extends ZitadelUpdateLabelPolicyRequest {
	details?: ZitadelObjectDetails;
	isDefault?: boolean;
	logoUrl?: string;
	iconUrl?: string;
	logoUrlDark?: string;
	iconUrlDark?: string;
	fontUrl?: string;
}

export interface ZitadelGetLabelPolicyResponse {
	policy?: ZitadelLabelPolicy;
}

export interface ZitadelListResponse {
	details?: ZitadelListDetails;
}

// --- Instance and org policies (Admin + Management API) -----------------------------------------
// Source: proto/zitadel/{admin,management,policy}.proto at v4.19.4. Durations are protobuf JSON
// durations ("3600s"); a PUT replaces the whole policy, so every field is required here.

export type ZitadelPasswordlessType = "PASSWORDLESS_TYPE_NOT_ALLOWED" | "PASSWORDLESS_TYPE_ALLOWED";

export type ZitadelSecondFactorType =
	| "SECOND_FACTOR_TYPE_OTP"
	| "SECOND_FACTOR_TYPE_U2F"
	| "SECOND_FACTOR_TYPE_OTP_EMAIL"
	| "SECOND_FACTOR_TYPE_OTP_SMS";

export type ZitadelMultiFactorType = "MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION";

/** Body of `PUT /admin/v1/policies/login` and `PUT /management/v1/policies/login`. */
export interface ZitadelLoginPolicy {
	allowUsernamePassword: boolean;
	allowRegister: boolean;
	allowExternalIdp: boolean;
	forceMfa: boolean;
	forceMfaLocalOnly: boolean;
	passwordlessType: ZitadelPasswordlessType;
	hidePasswordReset: boolean;
	ignoreUnknownUsernames: boolean;
	defaultRedirectUri: string;
	passwordCheckLifetime: string;
	externalLoginCheckLifetime: string;
	mfaInitSkipLifetime: string;
	secondFactorCheckLifetime: string;
	multiFactorCheckLifetime: string;
	allowDomainDiscovery: boolean;
	disableLoginWithEmail: boolean;
	disableLoginWithPhone: boolean;
}

/** Body of `POST /management/v1/policies/login` (an org's own login policy). */
export interface ZitadelCustomLoginPolicy extends ZitadelLoginPolicy {
	secondFactors: ZitadelSecondFactorType[];
	multiFactors: ZitadelMultiFactorType[];
}

/** Body of `PUT /admin/v1/policies/domain` and `/admin/v1/orgs/{orgId}/policies/domain`. */
export interface ZitadelDomainPolicy {
	userLoginMustBeDomain: boolean;
	validateOrgDomains: boolean;
	smtpSenderAddressMatchesInstanceDomain: boolean;
}

export interface ZitadelPasswordComplexityPolicy {
	minLength: number;
	hasUppercase: boolean;
	hasLowercase: boolean;
	hasNumber: boolean;
	hasSymbol: boolean;
}

/** `0` disables the lockout. A locked user stays locked until an admin unlocks it. */
export interface ZitadelLockoutPolicy {
	maxPasswordAttempts: number;
	maxOtpAttempts: number;
}

/** Body of `PUT /admin/v1/policies/security`. */
export interface ZitadelSecurityPolicy {
	enableIframeEmbedding: boolean;
	allowedOrigins: string[];
	enableImpersonation: boolean;
}

/** Body of `PUT /admin/v1/settings/oidc`. */
export interface ZitadelOIDCSettings {
	accessTokenLifetime: string;
	idTokenLifetime: string;
	refreshTokenIdleExpiration: string;
	refreshTokenExpiration: string;
}

/** Body of `PUT /admin/v1/restrictions`. */
export interface ZitadelRestrictions {
	/** Closes the Login V1 org sign-up page (`/ui/login/register/org`); Login V2 has none. */
	disallowPublicOrgRegistration: boolean;
}

// --- Organizations (v2 Organization API, Admin API) ---------------------------------------------

export interface ZitadelOrganization {
	id: string;
	name?: string;
	state?: string;
	primaryDomain?: string;
}

export interface ZitadelListOrganizationsResponse {
	details?: ZitadelListDetails;
	result?: ZitadelOrganization[];
}

export interface ZitadelAddOrganizationResponse {
	organizationId: string;
}

export interface ZitadelGetDefaultOrgResponse {
	org?: { id: string; name?: string };
}
