ALTER TABLE `projects` ADD `parent_project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `is_feature_project` integer DEFAULT false;