import { DB } from "../db";
import { Logger } from "./logger";

export class Audit {
	static async log(
		actorSub: string,
		action: string,
		targetInstanceId?: string | null,
		detail?: string | null,
	): Promise<void> {
		try {
			await DB.instance()
				.insert(DB.Tables.auditLog)
				.values({
					actor_sub: actorSub,
					action,
					target_instance_id: targetInstanceId ?? null,
					detail: detail ?? null,
				});
		} catch (err: any) {
			Logger.error("Error writing to audit log:", err);
		}
	}
}
