CREATE TABLE `echo_traffic_events` (
	`day` text NOT NULL,
	`visitor` text NOT NULL,
	`event` text NOT NULL,
	`page` text NOT NULL,
	`count` integer NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`day`, `visitor`, `event`, `page`)
);
