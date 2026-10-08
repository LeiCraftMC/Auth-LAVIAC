CREATE TABLE `instance_setups` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`options` text NOT NULL,
	`system_org_id` text,
	`home_org_id` text,
	`created_by_user_sub` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
