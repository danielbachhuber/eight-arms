CREATE TABLE "oauth_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"scopes" text DEFAULT '' NOT NULL,
	CONSTRAINT "oauth_credentials_service_unique" UNIQUE("service")
);
--> statement-breakpoint
CREATE TABLE "sync_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"interval_minutes" integer DEFAULT 5 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sync_config_service_unique" UNIQUE("service")
);
