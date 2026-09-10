CREATE TABLE `global_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`is_active` integer DEFAULT true,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `global_sanctions` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text,
	`mc_uuid` text,
	`reason` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_min_account_age_days` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_calculation_method` text DEFAULT 'current_balance';--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `default_corp_account` text;--> statement-breakpoint
ALTER TABLE `loans` ADD `initial_paid_amount` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `loans` ADD `is_off_system` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `loans` ADD `off_system_reference` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `fee_type` text;--> statement-breakpoint
CREATE INDEX `idx_account_members_account_id` ON `account_members` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_account_members_discord_id` ON `account_members` (`discord_id`);--> statement-breakpoint
CREATE INDEX `idx_address_book_owner` ON `address_book` (`owner_discord_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_customers_bank_id` ON `bank_customers` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_customers_discord_id` ON `bank_customers` (`discord_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_customers_mc_uuid` ON `bank_customers` (`mc_uuid`);--> statement-breakpoint
CREATE INDEX `idx_cards_bank_id` ON `cards` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_account_id` ON `cards` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_citycorp_logs_bank_id` ON `city_corp_logs` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_citycorp_logs_ts` ON `city_corp_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_settlements_from_bank` ON `clearinghouse_settlements` (`from_bank_id`);--> statement-breakpoint
CREATE INDEX `idx_settlements_to_bank` ON `clearinghouse_settlements` (`to_bank_id`);--> statement-breakpoint
CREATE INDEX `idx_global_admins_discord_id` ON `global_admins` (`discord_id`);--> statement-breakpoint
CREATE INDEX `idx_interbank_from_bank` ON `inter_bank_transfers` (`from_bank_id`);--> statement-breakpoint
CREATE INDEX `idx_interbank_to_bank` ON `inter_bank_transfers` (`to_bank_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_bank_id` ON `invoices` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_customer_acc` ON `invoices` (`customer_account_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_biller_acc` ON `invoices` (`biller_account_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_links_owner` ON `payment_links` (`owner_discord_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_links_biller` ON `payment_links` (`biller_account_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_bank_id` ON `payroll_jobs` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_employer_acc` ON `payroll_jobs` (`employer_account_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_employee_acc` ON `payroll_jobs` (`employee_account_id`);--> statement-breakpoint
CREATE INDEX `idx_recurring_transfers_owner` ON `recurring_transfers` (`owner_discord_id`);--> statement-breakpoint
CREATE INDEX `idx_saas_invoices_bank_id` ON `saas_invoices` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_savings_goals_owner` ON `savings_goals` (`owner_discord_id`);--> statement-breakpoint
CREATE INDEX `idx_savings_goals_account` ON `savings_goals` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_subs_bank_id` ON `subscriptions` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_subs_customer_acc` ON `subscriptions` (`customer_account_id`);--> statement-breakpoint
CREATE INDEX `idx_subs_biller_acc` ON `subscriptions` (`biller_account_id`);--> statement-breakpoint
CREATE INDEX `idx_vault_deposits_bank_id` ON `vault_deposits` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_vault_deposits_account_id` ON `vault_deposits` (`account_id`);