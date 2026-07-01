CREATE TABLE `bank_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`kyc_status` text DEFAULT 'pending',
	`mc_uuid` text,
	`mc_username` text,
	`city_corp_token` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `city_corp_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text,
	`endpoint` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`status` integer NOT NULL,
	`success` integer NOT NULL,
	`error_message` text,
	`payload` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `credit_products` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`name` text NOT NULL,
	`interest_rate` integer NOT NULL,
	`max_limit` integer NOT NULL,
	`rewards_percent` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loan_products` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`name` text NOT NULL,
	`interest_rate` integer NOT NULL,
	`max_amount` integer NOT NULL,
	`term_days` integer NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `banks` ADD `city_corp_app_id` text;--> statement-breakpoint
ALTER TABLE `banks` ADD `city_corp_app_secret` text;