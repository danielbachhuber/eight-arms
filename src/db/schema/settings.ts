import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const oauthCredentials = pgTable("oauth_credentials", {
  id: serial("id").primaryKey(),
  service: text("service").notNull().unique(), // 'gmail' | 'github' | 'todoist'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull().default(""),
});

export const insertOauthCredentialSchema = createInsertSchema(oauthCredentials);
export const selectOauthCredentialSchema = createSelectSchema(oauthCredentials);

export type OauthCredential = typeof oauthCredentials.$inferSelect;
export type NewOauthCredential = typeof oauthCredentials.$inferInsert;

export const syncConfig = pgTable("sync_config", {
  id: serial("id").primaryKey(),
  service: text("service").notNull().unique(), // 'gmail' | 'github' | 'todoist'
  intervalMinutes: integer("interval_minutes").notNull().default(5),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
});

export const insertSyncConfigSchema = createInsertSchema(syncConfig);
export const selectSyncConfigSchema = createSelectSchema(syncConfig);

export type SyncConfig = typeof syncConfig.$inferSelect;
export type NewSyncConfig = typeof syncConfig.$inferInsert;
