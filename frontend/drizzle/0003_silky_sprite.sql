CREATE TABLE `echo_launch_project_profiles` (
	`scope` text NOT NULL,
	`project` text NOT NULL,
	`version` integer NOT NULL,
	`digest` text NOT NULL,
	`previous_digest` text NOT NULL,
	`payload` text NOT NULL,
	`accepted_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `project`, `version`)
);
