CREATE TABLE `inter_bank_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`from_bank_id` text NOT NULL,
	`to_bank_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending_wire',
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`from_bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `onyx_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`b2b_api_fee_percent` integer DEFAULT 200,
	`clearinghouse_enabled` integer DEFAULT true
);
--> statement-breakpoint
ALTER TABLE `bank_settings` ADD `inter_bank_wire_threshold` integer DEFAULT 5000000;