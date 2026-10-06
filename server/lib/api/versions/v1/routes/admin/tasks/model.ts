import { z } from "zod";
import { TaskData } from "../../../../../utils/shared-models/taskData";

export namespace AdminTasksModel.GetAll {
	export const Query = z.object({
		limit: z.coerce.number().int().min(1).max(500).default(200),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = z.array(TaskData.Task);
	export type Response = z.infer<typeof Response>;
}

export namespace AdminTasksModel.TaskId {
	export const Params = z.object({
		taskId: z.coerce.number().int().positive(),
	});
	export type Params = z.infer<typeof Params>;
}

export namespace AdminTasksModel.Get {
	export const Response = TaskData.Task.extend({
		/** The task's log file (tasks run with `storeLogs`), `null` when there is none. */
		logs: z.string().nullable(),
	});
	export type Response = z.infer<typeof Response>;
}
