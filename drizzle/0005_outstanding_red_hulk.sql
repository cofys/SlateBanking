CREATE TABLE `global_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text,
	`action` text NOT NULL,
	`details` text,
	`ip_address` text,
	`route` text,
	`method` text,
	`bank_id` text,
	`latency_ms` integer,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `tier_id` text;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `custom_transfer_fee_percent` integer;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `custom_deposit_fee_percent` integer;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `custom_withdraw_fee_percent` integer;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `custom_apy_percent` integer;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `exists_in_game` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `last_synced_at` integer;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `sync_error` text;--> statement-breakpoint
CREATE INDEX `idx_bank_accounts_bank_id` ON `bank_accounts` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_accounts_owner_discord_id` ON `bank_accounts` (`owner_discord_id`);--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `enable_account_tiers` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `account_tiers` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_payment_schedule` text DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_next_payment_at` integer;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_target_accounts` text DEFAULT 'savings_only';--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_min_balance` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_max_account_balance` integer;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `interest_requires_activity_days` integer;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `enable_google_docs_contracts` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `google_docs_loan_template_url` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `google_docs_credit_template_url` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `google_docs_escrow_template_url` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `google_docs_folder_url` text;--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `google_docs_auto_generate` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `credit_applications` ADD `contract_url` text;--> statement-breakpoint
ALTER TABLE `credit_applications` ADD `contract_text` text;--> statement-breakpoint
ALTER TABLE `credit_applications` ADD `client_signed_at` integer;--> statement-breakpoint
ALTER TABLE `escrows` ADD `contract_url` text;--> statement-breakpoint
ALTER TABLE `escrows` ADD `contract_text` text;--> statement-breakpoint
ALTER TABLE `escrows` ADD `client_signed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_escrows_bank_id` ON `escrows` (`bank_id`);--> statement-breakpoint
ALTER TABLE `loans` ADD `contract_url` text;--> statement-breakpoint
ALTER TABLE `loans` ADD `contract_text` text;--> statement-breakpoint
ALTER TABLE `loans` ADD `client_signed_at` integer;--> statement-breakpoint
ALTER TABLE `loans` ADD `collateral_description` text;--> statement-breakpoint
ALTER TABLE `loans` ADD `collateral_value` integer;--> statement-breakpoint
ALTER TABLE `loans` ADD `collateral_status` text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `loans` ADD `late_fee_amount` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `loans` ADD `is_delinquent` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `loans` ADD `missed_payments_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `loans` ADD `last_interest_accrual_at` integer;--> statement-breakpoint
ALTER TABLE `loans` ADD `last_payment_attempt_at` integer;--> statement-breakpoint
CREATE INDEX `idx_loans_bank_id` ON `loans` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_loans_discord_id` ON `loans` (`discord_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_bank_id` ON `audit_logs` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_discord_id` ON `audit_logs` (`user_discord_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_staff_bank_id` ON `bank_staff` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_bank_staff_discord_id` ON `bank_staff` (`discord_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_bank_id` ON `transactions` (`bank_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_from_acc` ON `transactions` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_to_acc` ON `transactions` (`to_account_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_ts` ON `transactions` (`timestamp`);