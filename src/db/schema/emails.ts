import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const emails = pgTable("emails", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  snippet: text("snippet").notNull().default(""),
  body: text("body").notNull().default(""),
  date: timestamp("date", { withTimezone: true }).notNull(),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailSchema = createInsertSchema(emails, {
  labels: z.array(z.string()),
});
export const selectEmailSchema = createSelectSchema(emails, {
  labels: z.array(z.string()),
});

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
