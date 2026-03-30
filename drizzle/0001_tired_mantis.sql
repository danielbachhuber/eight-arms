CREATE TABLE "github_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"state" text NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"closed_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"review_decision" text,
	"review_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ci_status" text,
	"branch" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"merged_at" timestamp with time zone,
	"merged_by" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
