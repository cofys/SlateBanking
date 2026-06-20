CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`user_discord_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`owner_discord_id` text NOT NULL,
	`account_name` text NOT NULL,
	`account_type` text DEFAULT 'personal',
	`balance` integer DEFAULT 0 NOT NULL,
	`credit_limit` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_settings` (
	`bank_id` text PRIMARY KEY NOT NULL,
	`withdraw_fee_percent` integer DEFAULT 0,
	`deposit_fee_percent` integer DEFAULT 0,
	`transfer_fee_percent` integer DEFAULT 0,
	`color_scheme` text DEFAULT 'indigo',
	`logo_url` text,
	`support_email` text,
	`discord_webhook_url` text,
	`require_kyc` integer DEFAULT false,
	`discord_verified_role_id` text,
	`discord_client_role_id` text,
	`enable_loans` integer DEFAULT true,
	`enable_vaults` integer DEFAULT true,
	`enable_cards` integer DEFAULT true,
	`enable_payroll` integer DEFAULT true,
	`enable_subscriptions` integer DEFAULT true,
	`enable_escrow` integer DEFAULT true,
	`enable_treasury` integer DEFAULT true,
	`auto_approve_loans` integer DEFAULT false,
	`auto_approve_credit_cards` integer DEFAULT false,
	`max_auto_approve_loan_amount` integer DEFAULT 1000000,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `banks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`guild_id` text NOT NULL,
	`discord_token` text NOT NULL,
	`corp_id` integer,
	`corp_api_uuid` text,
	`corp_api_key` text,
	`custom_domain` text,
	`branding_color` text DEFAULT '#4f46e5',
	`logo_url` text,
	`api_key` text,
	`webhook_secret` text,
	`status` text DEFAULT 'offline',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`account_id` text NOT NULL,
	`card_number` text NOT NULL,
	`cvv` text NOT NULL,
	`expiry_date` text NOT NULL,
	`is_locked` integer DEFAULT false,
	`type` text NOT NULL,
	`credit_limit` integer DEFAULT 0,
	`credit_used` integer DEFAULT 0,
	`apr` integer DEFAULT 0,
	`minimum_payment` integer DEFAULT 0,
	`next_payment_date` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_card_number_unique` ON `cards` (`card_number`);--> statement-breakpoint
CREATE TABLE `clearinghouse_balances` (
	`bank_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`last_settled` integer,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clearinghouse_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`from_bank_id` text NOT NULL,
	`to_bank_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `credit_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`account_id` text NOT NULL,
	`requested_limit` integer NOT NULL,
	`monthly_income` integer NOT NULL,
	`purpose` text,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `escrows` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`buyer_account_id` text NOT NULL,
	`seller_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`biller_account_id` text NOT NULL,
	`customer_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`biller_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`account_id` text NOT NULL,
	`principal_amount` integer NOT NULL,
	`remaining_amount` integer NOT NULL,
	`interest_rate` integer NOT NULL,
	`next_payment_date` integer NOT NULL,
	`purpose` text,
	`status` text DEFAULT 'pending',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `onyx_merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_key` text NOT NULL,
	`bank_id` text NOT NULL,
	`destination_account` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onyx_merchants_api_key_unique` ON `onyx_merchants` (`api_key`);--> statement-breakpoint
CREATE TABLE `payroll_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`employer_account_id` text NOT NULL,
	`employee_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`next_run` integer NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employer_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`biller_account_id` text NOT NULL,
	`customer_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`next_run` integer NOT NULL,
	`is_active` integer DEFAULT true,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`biller_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`from_account_id` text,
	`to_account_id` text,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`mc_uuid` text NOT NULL,
	`mc_username` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);--> statement-breakpoint
CREATE TABLE `vault_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`locked_until` integer NOT NULL,
	`interest_rate` integer NOT NULL,
	`status` text DEFAULT 'locked',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
