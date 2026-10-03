ALTER TABLE `instance` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `instance` ADD `google_email` text;--> statement-breakpoint
-- An upgraded instance signed in with Google: that email is the connected account, so reconnecting it keeps the data.
UPDATE `instance` SET `google_email` = `owner_email` WHERE `google_email` IS NULL;