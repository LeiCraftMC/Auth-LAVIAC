CREATE TABLE `host_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cpu_usage` real,
	`load_1` real NOT NULL,
	`mem_total` integer NOT NULL,
	`mem_used` integer NOT NULL,
	`swap_total` integer NOT NULL,
	`swap_used` integer NOT NULL,
	`disk_total` integer,
	`disk_used` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`function` text NOT NULL,
	`created_by_user_sub` text,
	`args` text NOT NULL,
	`autoDelete` integer DEFAULT 0 NOT NULL,
	`storeLogs` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`result` text,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks_paused_state` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`next_step_to_execute` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `scheduled_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
