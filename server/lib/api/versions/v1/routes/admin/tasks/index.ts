import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { TaskUtils } from "../../../../../../tasks/utils";
import { APIResponse } from "../../../../../utils/api-res";
import { TaskData } from "../../../../../utils/shared-models/taskData";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminTasksModel } from "./model";

export const router = new Hono().basePath("/tasks");

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List background tasks",
		description: "Background tasks (e.g. applying the default branding), newest first.",
		tags: [DOCS_TAGS.ADMIN_API.TASKS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Tasks retrieved successfully", AdminTasksModel.GetAll.Response),
		),
	}),

	zValidator("query", AdminTasksModel.GetAll.Query),

	async (c) => {
		const { limit } = c.req.valid("query");

		const tasks = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.orderBy(desc(DB.Tables.scheduled_tasks.id))
			.limit(limit)
			.all();

		return APIResponse.success(
			c,
			"Tasks retrieved successfully",
			tasks.map((task) => TaskData.Task.parse(task)),
		);
	},
);

router.get(
	"/:taskId",

	APIRouteSpec.authenticated({
		summary: "Get a background task",
		description: "One background task including its log output.",
		tags: [DOCS_TAGS.ADMIN_API.TASKS],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Task retrieved successfully", AdminTasksModel.Get.Response),
			APIResponseSpec.notFound("Task not found"),
		),
	}),

	zValidator("param", AdminTasksModel.TaskId.Params),

	async (c) => {
		// @ts-ignore - hono-openapi does not type "param" yet
		const { taskId } = c.req.valid("param") as AdminTasksModel.TaskId.Params;

		const task = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(eq(DB.Tables.scheduled_tasks.id, taskId))
			.get();

		if (!task) {
			return APIResponse.notFound(c, "Task not found");
		}

		return APIResponse.success(c, "Task retrieved successfully", {
			...TaskData.Task.parse(task),
			logs: task.storeLogs ? await TaskUtils.getLogsForTask(task.id) : null,
		} satisfies AdminTasksModel.Get.Response);
	},
);
