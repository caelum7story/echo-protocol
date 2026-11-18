CREATE TABLE `echo_agentic_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`connection` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer
);
--> statement-breakpoint
CREATE TABLE `echo_agentic_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `echo_agentic_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`connection` text NOT NULL,
	`state` text NOT NULL,
	`view` text NOT NULL,
	`operation` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
