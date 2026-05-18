CREATE TABLE `github_repo_cache` (
	`full_name` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_private` integer DEFAULT false NOT NULL,
	`url` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_repo_cache_name_idx` ON `github_repo_cache` (`name`);--> statement-breakpoint
CREATE INDEX `github_repo_cache_synced_at_idx` ON `github_repo_cache` (`synced_at`);