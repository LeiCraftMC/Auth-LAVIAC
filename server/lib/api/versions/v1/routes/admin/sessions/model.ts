import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../../../../db";

export namespace AdminSessionsModel {
	export const Session = createSelectSchema(DB.Tables.sessions).omit({ hashed_token: true }).extend({
		/** The session making this request. */
		current: z.boolean(),
	});
	export type Session = z.infer<typeof Session>;
}

export namespace AdminSessionsModel.GetAll {
	export const Response = z.array(AdminSessionsModel.Session);
	export type Response = z.infer<typeof Response>;
}

export namespace AdminSessionsModel.SessionId {
	export const Params = z.object({
		sessionId: z.string().min(1).max(128),
	});
	export type Params = z.infer<typeof Params>;
}
