CREATE TABLE `echo_launch_observations` (
	`key` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`block_number` integer,
	`block_hash` text,
	`payload` text NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `echo_launch_projects` (
	`scope` text NOT NULL,
	`ordinal` integer NOT NULL,
	`address` text NOT NULL,
	`kind` integer NOT NULL,
	`creator` text NOT NULL,
	`factory` text NOT NULL,
	`version_id` text NOT NULL,
	`config_hash` text NOT NULL,
	`block_number` integer NOT NULL,
	`block_hash` text NOT NULL,
	`payload` text NOT NULL,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `ordinal`)
);
--> statement-breakpoint
CREATE TABLE `echo_launch_event_ranges` (
	`scope` text NOT NULL,
	`project` text NOT NULL,
	`from_block` integer NOT NULL,
	`to_block` integer NOT NULL,
	`anchor_hash` text NOT NULL,
	`payload` text NOT NULL,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `project`, `from_block`, `to_block`)
);
--> statement-breakpoint
CREATE TABLE `echo_launch_rate_window` (
	`window` integer PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
