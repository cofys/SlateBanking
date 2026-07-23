CREATE TABLE `account_members` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `address_book` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_discord_id` text NOT NULL,
	`contact_account_id` text NOT NULL,
	`nickname` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `onyx_merchant_products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`price_type` text DEFAULT 'fixed' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `onyx_merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `onyx_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`created_by_discord_id` text NOT NULL,
	`client_discord_id` text,
	`amount` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`expires_at` integer,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `onyx_merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_discord_id` text NOT NULL,
	`biller_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_discord_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saas_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`amount` integer NOT NULL,
	`period` text NOT NULL,
	`billing_model_used` text,
	`breakdown_details` text,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_discord_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`current_amount` integer DEFAULT 0,
	`deadline` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `business_tax_id` text;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `business_sector` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `gui_channel_id` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `gui_message_id` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `staff_channel_id` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `staff_message_id` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `vault_tiers` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `login_bg_url` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `savings_apy_percent` integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `require_personal_for_business` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `last_interest_accrual_at` integer;--> statement-breakpoint
ALTER TABLE `banks` ADD `billing_model` text DEFAULT 'flat_monthly';--> statement-breakpoint
ALTER TABLE `banks` ADD `flat_monthly_rate` integer DEFAULT 15000;--> statement-breakpoint
ALTER TABLE `banks` ADD `volume_fee_percent` integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE `banks` ADD `profit_share_percent` integer DEFAULT 500;--> statement-breakpoint
ALTER TABLE `banks` ADD `per_account_rate` integer DEFAULT 150;--> statement-breakpoint
ALTER TABLE `banks` ADD `per_tx_rate` integer DEFAULT 25;--> statement-breakpoint
ALTER TABLE `banks` ADD `billing_notes` text;--> statement-breakpoint
ALTER TABLE `onyx_settings` ADD `bot_token` text;--> statement-breakpoint
ALTER TABLE `onyx_settings` ADD `gui_channel_id` text;--> statement-breakpoint
ALTER TABLE `onyx_settings` ADD `gui_message_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `category` text;