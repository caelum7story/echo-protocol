CREATE INDEX `echo_agentic_queue_idx` ON `echo_agentic_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `echo_agentic_connection_idx` ON `echo_agentic_jobs` (`connection`,`kind`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `echo_agentic_meta_expiry_idx` ON `echo_agentic_meta` (`expires_at`);--> statement-breakpoint
CREATE INDEX `echo_agentic_session_expiry_idx` ON `echo_agentic_sessions` (`state`,`expires_at`);