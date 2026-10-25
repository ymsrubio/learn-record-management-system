CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`reason` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`walk_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `appointments_patient_start_idx` ON `appointments` (`patient_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `patient_views` (
	`user_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`last_viewed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `patient_id`)
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `name_search` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` ADD `phone_search` text;
--> statement-breakpoint
UPDATE `patients` SET `name_search` = lower(trim(`full_name`)), `phone_search` = substr(replace(replace(replace(replace(replace(`mobile_phone`, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), -10) WHERE `mobile_phone` IS NOT NULL;
