CREATE TABLE "email_github_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_thread_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"estimate" text,
	"is_actionable" boolean DEFAULT false NOT NULL,
	"groomed_at" timestamp with time zone DEFAULT now() NOT NULL
);
