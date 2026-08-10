CREATE TABLE `agent_artifacts` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node` text NOT NULL,
	`artifact_type` text NOT NULL,
	`schema_version` text NOT NULL,
	`storage_key` text,
	`byte_length` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_artifacts_run_idx` ON `agent_artifacts` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_artifacts_run_node_type_idx` ON `agent_artifacts` (`run_id`,`node`,`artifact_type`);--> statement-breakpoint
CREATE TABLE `agent_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_events_run_sequence_idx` ON `agent_events` (`run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `agent_events_run_idx` ON `agent_events` (`run_id`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`status` text NOT NULL,
	`source_hash` text NOT NULL,
	`source_type` text NOT NULL,
	`source_label` text NOT NULL,
	`current_node` text,
	`idempotency_key` text,
	`failure_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_idempotency_key_unique` ON `agent_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);--> statement-breakpoint
CREATE INDEX `agent_runs_source_hash_idx` ON `agent_runs` (`source_hash`);--> statement-breakpoint
CREATE TABLE `agent_steps` (
	`step_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`checkpoint_id` text,
	`latency_ms` integer,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_steps_run_node_attempt_idx` ON `agent_steps` (`run_id`,`node`,`attempt`);--> statement-breakpoint
CREATE INDEX `agent_steps_run_idx` ON `agent_steps` (`run_id`);--> statement-breakpoint
CREATE TABLE `eval_runs` (
	`eval_run_id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`runner` text NOT NULL,
	`report_schema_version` text NOT NULL,
	`report_storage_key` text,
	`passed` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `eval_runs_dataset_idx` ON `eval_runs` (`dataset`);