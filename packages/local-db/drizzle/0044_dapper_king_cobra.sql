CREATE TABLE `repo_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repos` text DEFAULT '[]' NOT NULL,
	`tab_order` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repo_groups_created_at_idx` ON `repo_groups` (`created_at`);