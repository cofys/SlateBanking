CREATE TABLE `global_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_admins_discord_id_unique` ON `global_admins` (`discord_id`);--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `is_frozen` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `is_system` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `system_category` text;--> statement-breakpoint
ALTER TABLE `bank_customers` ADD `linked_discord_id` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `discord_client_id` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `discord_client_secret` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `city_corp_auth_url` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `api_webhook_url` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `plan` text DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE `banks` ADD `billing_status` text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `banks` ADD `platform_fee_percent` integer DEFAULT 200;--> statement-breakpoint
ALTER TABLE `banks` ADD `maintenance_mode` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `onyx_settings` ADD `global_bot_maintenance` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `transactions` ADD `is_flagged` integer DEFAULT false;