ALTER TABLE `projects` ADD `is_gitless` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `active_organization_id`;