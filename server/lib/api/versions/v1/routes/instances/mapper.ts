/**
 * Mappers — Zitadel v1 System API shapes → LAVIAC-facing envelope shapes.
 */
import type { ZitadelDomain, ZitadelInstance } from "../../../../../zitadel/types";
import type { Instance, InstanceDomain } from "./model";

export function mapDomain(d: ZitadelDomain): InstanceDomain {
	return {
		domain: d.domain,
		primary: d.primary,
		generated: d.generated,
	};
}

export function mapInstance(i: ZitadelInstance): Instance {
	return {
		id: i.id,
		name: i.name,
		state: i.state,
		version: i.version,
		createdAt: i.details?.creationDate,
		changedAt: i.details?.changeDate,
		domains: i.domains?.map(mapDomain),
	};
}
