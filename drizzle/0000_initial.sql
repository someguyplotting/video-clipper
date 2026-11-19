CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_sec` real NOT NULL,
	`end_sec` real NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`aspect` text DEFAULT '9:16' NOT NULL,
	`focus_mode` text DEFAULT 'manual' NOT NULL,
	`focus_x` real DEFAULT 0.5 NOT NULL,
	`focus_y` real DEFAULT 0.5 NOT NULL,
	`keyframes` text DEFAULT '[]' NOT NULL,
	`captions_on` integer DEFAULT true NOT NULL,
	`caption_style` text DEFAULT 'pop' NOT NULL,
	`words` text DEFAULT '[]' NOT NULL,
	`template_id` text,
	`export_status` text DEFAULT 'none' NOT NULL,
	`export_size` integer,
	`exported_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clips_project_idx` ON `clips` (`project_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`default_template_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`duration_sec` real DEFAULT 0 NOT NULL,
	`content_type` text DEFAULT 'video/mp4' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`error` text,
	`scan_start` real,
	`scan_end` real,
	`length_band` text DEFAULT 'auto' NOT NULL,
	`prompt` text,
	`audio_chunks` integer DEFAULT 0 NOT NULL,
	`chunk_sec` real DEFAULT 0 NOT NULL,
	`run_id` text,
	`transcript` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`font` text DEFAULT 'sans' NOT NULL,
	`text_color` text DEFAULT '#ffffff' NOT NULL,
	`highlight_color` text DEFAULT '#facc15' NOT NULL,
	`position` text DEFAULT 'bottom' NOT NULL,
	`uppercase` integer DEFAULT false NOT NULL,
	`has_logo` integer DEFAULT false NOT NULL,
	`logo_corner` text DEFAULT 'top-right' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_user_idx` ON `templates` (`user_id`);