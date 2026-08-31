/** LAVIAC frontend types — mirror the backend v1 route models (envelope `data`). */

export interface InstanceDomain {
	domain: string;
	primary?: boolean;
	generated?: boolean;
}

export interface Instance {
	id: string;
	name: string;
	state: string;
	version?: string;
	createdAt?: string;
	changedAt?: string;
	domains?: InstanceDomain[];
}

export interface HumanOwner {
	userName: string;
	email: { email: string; isEmailVerified?: boolean };
	profile: { firstName: string; lastName: string; preferredLanguage?: string };
	password: { password: string; passwordChangeRequired?: boolean };
}

export interface MachineOwner {
	userName: string;
	name: string;
	personalAccessToken?: { expirationDate?: string };
	machineKey?: { type: string; expirationDate?: string };
}

export interface CreateInstanceBody {
	instanceName: string;
	firstOrgName?: string;
	customDomain?: string;
	defaultLanguage?: string;
	human?: HumanOwner;
	machine?: MachineOwner;
}

export interface CreateInstanceResult {
	instanceId: string;
	pat?: string;
	machineKey?: string;
}

export function primaryDomain(instance: Instance): string | undefined {
	return instance.domains?.find((d) => d.primary)?.domain ?? instance.domains?.[0]?.domain;
}
