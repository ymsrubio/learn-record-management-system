CREATE TABLE `amendments` (
	`id` text PRIMARY KEY NOT NULL,
	`treatment_note_id` text NOT NULL,
	`text` text NOT NULL,
	`written_by` text NOT NULL,
	`written_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `amendments_note_idx` ON `amendments` (`treatment_note_id`,`written_at`);--> statement-breakpoint
CREATE TABLE `treatment_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`findings` text NOT NULL,
	`treatment_done` text NOT NULL,
	`next_steps` text,
	`written_by` text NOT NULL,
	`written_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `treatment_notes_appointment_uidx` ON `treatment_notes` (`appointment_id`);