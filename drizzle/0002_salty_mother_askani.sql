CREATE TABLE `backlink_results` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`include_subdomains` integer DEFAULT true NOT NULL,
	`results_json` text NOT NULL,
	`has_data` integer DEFAULT false NOT NULL,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_results_unique_project_target_subdomains` ON `backlink_results` (`project_id`,`target`,`include_subdomains`);