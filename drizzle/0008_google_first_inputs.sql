ALTER TABLE `daily_metrics` ADD `hr_zones` text;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `light_moderate_min` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `vigorous_peak_min` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `temp_baseline_c` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `temp_sd_c` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `rhr_range_low` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `rhr_range_high` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `hrv_range_low` real;--> statement-breakpoint
ALTER TABLE `daily_metrics` ADD `hrv_range_high` real;