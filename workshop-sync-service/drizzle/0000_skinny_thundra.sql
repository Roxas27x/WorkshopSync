CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expected` text NOT NULL,
	`state_hash` text,
	`expires` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`owner` text NOT NULL,
	`appid` text NOT NULL,
	`name` text NOT NULL,
	`curated` text NOT NULL,
	`subscriptions` text NOT NULL,
	`share_list` integer NOT NULL,
	`share_subscriptions` integer NOT NULL,
	`list_count` integer NOT NULL,
	`subscription_count` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`owner`, `appid`)
);
--> statement-breakpoint
CREATE TABLE `nonces` (
	`hash` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`steamid` text PRIMARY KEY NOT NULL,
	`friends` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`steamid` text NOT NULL,
	`expires` integer NOT NULL
);
