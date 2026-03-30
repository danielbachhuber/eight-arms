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

export const todoistTasks = pgTable("todoist_tasks", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  description: text("description").notNull().default(""),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  priority: integer("priority").notNull().default(4),
  dueDate: timestamp("due_date", { withTimezone: true }),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  isCompleted: boolean("is_completed").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTodoistTaskSchema = createInsertSchema(todoistTasks, {
  labels: z.array(z.string()),
});
export const selectTodoistTaskSchema = createSelectSchema(todoistTasks, {
  labels: z.array(z.string()),
});

export type TodoistTask = typeof todoistTasks.$inferSelect;
export type NewTodoistTask = typeof todoistTasks.$inferInsert;
