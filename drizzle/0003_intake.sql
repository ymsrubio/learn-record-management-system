CREATE TABLE `dental_histories` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`visit_reason` text NOT NULL,
	`former_dentist_name` text,
	`former_dentist_contact` text,
	`former_dentist_address` text,
	`last_dental_care` text,
	`symptoms` text NOT NULL,
	`brush_frequency` text NOT NULL,
	`floss_frequency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`phone` text NOT NULL,
	`phone_search` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `medical_histories` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`serious_illness` integer NOT NULL,
	`serious_illness_details` text,
	`blood_transfusion` integer NOT NULL,
	`transfusion_dates` text,
	`pregnant` integer,
	`nursing` integer,
	`birth_control` integer,
	`conditions` text NOT NULL,
	`medications` text,
	`allergies` text NOT NULL,
	`allergies_other` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `previous_surname` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `previous_surname_search` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `sex` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `occupation` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `landline` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `email` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `address` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `emergency_contact_name` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `emergency_contact_phone` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `patient_history` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `guardian_id` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `consent_given_on` text;