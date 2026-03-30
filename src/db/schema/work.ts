import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const emailGithubLinks = pgTable("email_github_links", {
  id: serial("id").primaryKey(),
  emailThreadId: text("email_thread_id").notNull(),
  sourceType: text("source_type").notNull(), // 'pull_request' | 'issue'
  sourceId: text("source_id").notNull(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
}, (table) => [
  uniqueIndex("email_github_links_unique").on(table.emailThreadId, table.sourceType, table.sourceId),
]);

export const insertEmailGithubLinkSchema = createInsertSchema(emailGithubLinks);
export const selectEmailGithubLinkSchema = createSelectSchema(emailGithubLinks);

export type EmailGithubLink = typeof emailGithubLinks.$inferSelect;
export type NewEmailGithubLink = typeof emailGithubLinks.$inferInsert;

export const workNotes = pgTable("work_notes", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'email' | 'pull_request' | 'issue' | 'todoist_task'
  sourceId: text("source_id").notNull(),
  notes: text("notes").notNull().default(""),
  estimate: text("estimate"), // e.g. "30m", "2h"
  isActionable: boolean("is_actionable").notNull().default(false),
  groomedAt: timestamp("groomed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkNoteSchema = createInsertSchema(workNotes);
export const selectWorkNoteSchema = createSelectSchema(workNotes);

export type WorkNote = typeof workNotes.$inferSelect;
export type NewWorkNote = typeof workNotes.$inferInsert;
