import { TaskHandler } from "@cleverjs/utils";
import { and, asc, eq, or } from "drizzle-orm";
import fs from "fs";
import { dirname } from "path";
import { DB } from "../db";
import { Logger } from "../utils/logger";
import { ApplyDefaultBrandingTask } from "./applyDefaultBranding";
import { ProvisionInstanceTask } from "./provisionInstance";
import { TaskUtils } from "./utils";

type AdditionalTaskMeta = {
	// LAVIAC has no local users table — tasks record the creating session's `user_sub`.
	created_by_user_sub: string | null;
};
type TaskData = TaskHandler.BaseTaskData<AdditionalTaskMeta>;

export class TaskStorage extends TaskHandler.AbstractStorageDriver<TaskData, AdditionalTaskMeta> {
	private transportToDBFormat(task: TaskData, withID?: true): DB.Models.ScheduledTask;
	private transportToDBFormat(task: TaskData, withID: false): Omit<DB.Models.ScheduledTask, "id">;
	private transportToDBFormat(task: TaskData, withID = true): DB.Models.ScheduledTask {
		return {
			id: withID ? task.id! : (undefined as any),
			function: task.fn,
			created_by_user_sub: task.created_by_user_sub,
			args: task.args,
			status: task.status,
			autoDelete: task.execOptions?.autoDelete ?? false,
			storeLogs: task.execOptions?.storeLogs ?? false,
			created_at: task.created_at,
			finished_at: task.finished_at ?? null,
			result: task.result ?? null,
			message: task.message ?? null,
		};
	}

	private transportFromDBFormat(dbModel: DB.Models.ScheduledTask): TaskData {
		return {
			id: dbModel.id,
			fn: dbModel.function,
			created_by_user_sub: dbModel.created_by_user_sub,
			args: dbModel.args,
			status: dbModel.status,
			execOptions: {
				autoDelete: dbModel.autoDelete,
				storeLogs: dbModel.storeLogs,
			},
			created_at: dbModel.created_at,
			finished_at: dbModel.finished_at,
			result: dbModel.result,
			message: dbModel.message,
		};
	}

	async loadTask(id: number): Promise<TaskData | null> {
		const data = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(eq(DB.Tables.scheduled_tasks.id, id))
			.get();
		if (!data) return null;
		return this.transportFromDBFormat(data);
	}

	async createTask(data: Omit<TaskData, "id">): Promise<number> {
		const result = DB.instance()
			.insert(DB.Tables.scheduled_tasks)
			.values(this.transportToDBFormat(data as any, false))
			.returning()
			.get();
		return result.id;
	}

	async updateTask(data: TaskData): Promise<void> {
		await DB.instance()
			.update(DB.Tables.scheduled_tasks)
			.set(this.transportToDBFormat(data, false))
			.where(eq(DB.Tables.scheduled_tasks.id, data.id!));
	}

	async deleteTask(id: number): Promise<void> {
		await DB.instance().delete(DB.Tables.scheduled_tasks).where(eq(DB.Tables.scheduled_tasks.id, id));
	}

	async loadPausedOrPendingTasks(): Promise<TaskData[]> {
		const rows = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			// paused or pending tasks, oldest first so earlier submissions run first. LAVIAC also
			// picks up "running" ones: the queue runs one task at a time and only reloads when idle,
			// so a stored "running" status means the process died mid-task — run it again.
			.where(
				or(
					eq(DB.Tables.scheduled_tasks.status, "paused"),
					eq(DB.Tables.scheduled_tasks.status, "pending"),
					eq(DB.Tables.scheduled_tasks.status, "running"),
				),
			)
			.orderBy(asc(DB.Tables.scheduled_tasks.created_at))
			.all();

		return rows.map((row) => this.transportFromDBFormat(row));
	}

	async loadFinishedTasksWithAutoDelete(): Promise<TaskData[]> {
		const rows = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks)
			.where(
				and(
					eq(DB.Tables.scheduled_tasks.status, "completed"),
					eq(DB.Tables.scheduled_tasks.autoDelete, true),
				),
			)
			.orderBy(asc(DB.Tables.scheduled_tasks.finished_at))
			.all();
		return rows.map((row) => this.transportFromDBFormat(row));
	}

	async loadPausedTaskState(taskID: number): Promise<TaskHandler.TempPausedTaskState | null> {
		const row = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks_paused_state)
			.where(eq(DB.Tables.scheduled_tasks_paused_state.task_id, taskID))
			.get();
		if (!row) return null;
		return {
			nextStepToExecute: row.next_step_to_execute,
			data: row.data,
		};
	}

	async savePausedTaskState(
		taskID: number,
		pausedState: TaskHandler.TempPausedTaskState,
	): Promise<void> {
		const existing = DB.instance()
			.select()
			.from(DB.Tables.scheduled_tasks_paused_state)
			.where(eq(DB.Tables.scheduled_tasks_paused_state.task_id, taskID))
			.get();
		if (existing) {
			await DB.instance()
				.update(DB.Tables.scheduled_tasks_paused_state)
				.set({
					next_step_to_execute: pausedState.nextStepToExecute,
					data: pausedState.data,
				})
				.where(eq(DB.Tables.scheduled_tasks_paused_state.task_id, taskID));
		} else {
			await DB.instance().insert(DB.Tables.scheduled_tasks_paused_state).values({
				task_id: taskID,
				next_step_to_execute: pausedState.nextStepToExecute,
				data: pausedState.data,
			});
		}
	}

	async deletePausedTaskState(taskID: number): Promise<void> {
		await DB.instance()
			.delete(DB.Tables.scheduled_tasks_paused_state)
			.where(eq(DB.Tables.scheduled_tasks_paused_state.task_id, taskID));
	}
}

class PersistentLogger implements TaskHandler.PersistentTaskLoggerLike {
	readonly type = "persistent";

	private readonly writeStream?: fs.WriteStream;
	constructor(taskID: number) {
		try {
			const filePath = TaskUtils.getTaskLogFilePath(taskID);
			// Synchronous: the stream opens right away and must not race the directory creation.
			fs.mkdirSync(dirname(filePath), { recursive: true });

			this.writeStream = fs.createWriteStream(filePath, { flags: "a" });
			// Without a listener a failed open (full disk, read-only volume) is an uncaught exception.
			this.writeStream.on("error", (err) => {
				Logger.error("Persistent task logger failed:", err.message);
			});
		} catch (err) {
			Logger.error("Failed to create persistent task logger:", (err as Error).message);
		}
	}

	public debug(...msg: string[]) {
		this.writeSafe(`[${new Date(Date.now()).toISOString()}] [DEBUG] ${msg.join(" ")}\n`);
	}

	public info(...msg: string[]) {
		this.writeSafe(`[${new Date(Date.now()).toISOString()}] [INFO] ${msg.join(" ")}\n`);
	}

	public warn(...msg: string[]) {
		this.writeSafe(`[${new Date(Date.now()).toISOString()}] [WARN] ${msg.join(" ")}\n`);
	}

	public error(...msg: string[]) {
		this.writeSafe(`[${new Date(Date.now()).toISOString()}] [ERROR] ${msg.join(" ")}\n`);
	}

	async close() {
		if (!this.writeStream) {
			return Promise.resolve();
		}
		if (!this.writeStream.writable) {
			Logger.warn("Persistent task logger: write stream already closed");
			return Promise.resolve();
		}
		try {
			return new Promise<void>((resolve, reject) => {
				const stream = this.writeStream as fs.WriteStream;
				const cleanup = () => {
					stream.removeListener("error", onError);
				};
				const onError = (err: Error) => {
					cleanup();
					Logger.error("Error closing persistent task logger:", err.message);
					resolve(); // resolve rather than reject — closing is best-effort
				};
				stream.once("error", onError);
				stream.end(() => {
					cleanup();
					resolve();
				});
			});
		} catch (err) {
			Logger.error("Error closing persistent task logger:", (err as Error).message);
		}
		return Promise.resolve();
	}

	private writeSafe(data: string) {
		try {
			if (this.writeStream && this.writeStream.writable) {
				this.writeStream.write(data, (err) => {
					if (err) {
						Logger.error(`Trying to write: '${data}' but error occurred:`, err.message);
					}
				});
			} else {
				Logger.error(`Trying to write: '${data}' but no log file available`);
			}
		} catch (err) {
			Logger.error(`Trying to write: '${data}' but error occurred:`, (err as Error).message);
		}
	}
}

const Registry = new TaskHandler.TaskFNRegistry()
	.register(ApplyDefaultBrandingTask)
	.register(ProvisionInstanceTask);

const taskStorage = new TaskStorage();

/**
 * LAVIAC additions to `TaskHandler`: it only stores a task's final status, so record "running"
 * when a task starts (the Tasks and Branding pages show it), and never let the fire-and-forget
 * `processQueue()` calls reject — an unhandled rejection takes the server down.
 */
class LAVIACTaskHandler extends TaskHandler<
	(typeof Registry)["registry"],
	InstanceType<typeof TaskStorage>,
	TaskData,
	AdditionalTaskMeta
> {
	protected override async runTask(task: TaskData): Promise<void> {
		// TaskHandler only logs and skips an unknown function, leaving the row pending forever —
		// fail it instead (e.g. a task stored by an older LAVIAC whose function was removed).
		if (!(task.fn in this.tasks)) {
			await this.storage.updateTask({
				...task,
				status: "failed",
				finished_at: Date.now(),
				message: `Task function "${task.fn}" is not registered`,
			});
			return;
		}

		// A paused task keeps its status: TaskHandler reads it to restore the paused state.
		if (task.status !== "paused") {
			await this.storage.updateTask({ ...task, status: "running" });
		}
		await super.runTask(task);
	}

	override async processQueue(): Promise<void> {
		try {
			await super.processQueue();
		} catch (err) {
			Logger.error("Task queue processing failed:", err);
		}
	}
}

export const TaskScheduler = new LAVIACTaskHandler(
	{
		storage: taskStorage,
		defaultLogger: Logger,
		persistentLogger: PersistentLogger,
	},
	Registry,
);
