CREATE TABLE "oauth_app_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	CONSTRAINT "oauth_app_config_service_unique" UNIQUE("service")
);
