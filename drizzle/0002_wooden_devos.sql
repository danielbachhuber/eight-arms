CREATE TABLE "todoist_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	"priority" integer DEFAULT 4 NOT NULL,
	"due_date" timestamp with time zone,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
