CREATE TABLE `daily_values` (
	`day` text NOT NULL,
	`key` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`day`, `key`)
);
--> statement-breakpoint
CREATE TABLE `health_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ts` integer NOT NULL,
	`day` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_records_ts` ON `health_records` (`ts`);