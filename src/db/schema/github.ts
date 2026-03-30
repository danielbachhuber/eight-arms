import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const githubPullRequests = pgTable("github_pull_requests", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  state: text("state").notNull(),
  isDraft: boolean("is_draft").notNull().default(false),
  reviewDecision: text("review_decision"),
  reviewRequests: jsonb("review_requests").$type<string[]>().notNull().default([]),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  files: jsonb("files")
    .$type<{ path: string; additions: number; deletions: number }[]>()
    .notNull()
    .default([]),
  ciStatus: text("ci_status"),
  branch: text("branch").notNull(),
  body: text("body").notNull().default(""),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  mergedBy: text("merged_by"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPullRequestSchema = createInsertSchema(githubPullRequests, {
  reviewRequests: z.array(z.string()),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
  ),
});
export const selectPullRequestSchema = createSelectSchema(githubPullRequests, {
  reviewRequests: z.array(z.string()),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
  ),
});

export type PullRequest = typeof githubPullRequests.$inferSelect;
export type NewPullRequest = typeof githubPullRequests.$inferInsert;

export const githubIssues = pgTable("github_issues", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  state: text("state").notNull(),
  assignees: jsonb("assignees").$type<string[]>().notNull().default([]),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  body: text("body").notNull().default(""),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIssueSchema = createInsertSchema(githubIssues, {
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
});
export const selectIssueSchema = createSelectSchema(githubIssues, {
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
});

export type Issue = typeof githubIssues.$inferSelect;
export type NewIssue = typeof githubIssues.$inferInsert;
