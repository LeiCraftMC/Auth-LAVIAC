import { DB } from "../db";
import { auditLog } from "../db/schema";

/**
 * Audit — appends a row to the `audit_log` table for privileged actions.
 * Best-effort: failures are logged but never block the request.
 */
export class Audit {
	static async log(
		actorSub: string,
		action: string,
		targetInstanceId?: string | null,
		detail?: string | null,
	): Promise<void> {
		try {
			await DB.instance()
				.insert(auditLog)
				.values({
					actorSub,
					action,
					targetInstanceId: targetInstanceId ?? null,
					detail: detail ?? null,
				});
		} catch {
			// swallow — audit must not break the user action
		}
	}
}
