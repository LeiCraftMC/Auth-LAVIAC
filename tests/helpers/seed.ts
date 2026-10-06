import { randomUUID } from "crypto";
import { SessionHandler } from "../../server/lib/api/utils/authHandler";
import type { UserAccountSettings } from "../../server/lib/api/utils/shared-models/accountData";

export type SeededSession = Awaited<ReturnType<typeof SessionHandler.createSession>>;

/** A session as an OIDC login would create it — LAVIAC has no local users to seed. */
export async function seedSession(
	role: UserAccountSettings.Role = "admin",
	sub: string = `test-${randomUUID().slice(0, 8)}`,
): Promise<SeededSession> {
	const session = await SessionHandler.createSession({
		sub,
		email: `${sub}@example.com`,
		name: `Test ${role}`,
		role,
		method: "oidc",
	});
	return session satisfies SeededSession;
}
