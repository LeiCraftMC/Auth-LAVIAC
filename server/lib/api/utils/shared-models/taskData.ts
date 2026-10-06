import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../db";

/**
 * TaskData — a background task (`scheduled_tasks` row) as served by the API. Shared by the
 * admin tasks router and the instance branding router (which reports its last task).
 */
export namespace TaskData {
	export const Task = createSelectSchema(DB.Tables.scheduled_tasks, {
		args: z.record(z.string(), z.unknown()),
		result: z.record(z.string(), z.unknown()).nullable(),
	}).omit({ autoDelete: true });
	export type Task = z.infer<typeof Task>;
}
