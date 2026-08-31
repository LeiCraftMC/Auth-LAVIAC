import { z } from "zod";

/**
 * UserAccountSettings — the shared user-account policy.
 *
 * In the standard full-stack shape this file also defines the local user/password policies.
 * LAVIAC authenticates admins via Zitadel OIDC instead (see AGENTS.md), so only the role
 * enum lives here — it is shared between the sessions schema and the permission checks so
 * they cannot drift. See Style-Guides docs/08-database.md.
 */
export namespace UserAccountSettings {
	export const Roles = ["admin", "member"] as const;
	export const Role = z.enum(Roles);
	export type Role = z.infer<typeof Role>;
}