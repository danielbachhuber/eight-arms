CREATE TABLE "emails" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
