CREATE TABLE `logged_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`ts` integer NOT NULL,
	`day` text NOT NULL,
	`data` text NOT NULL,
	`google_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logged_entries_ts` ON `logged_entries` (`ts`);--> statement-breakpoint
CREATE INDEX `logged_entries_day_type` ON `logged_entries` (`day`,`type`);