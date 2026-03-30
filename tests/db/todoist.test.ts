import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { eq } from "drizzle-orm";

describe("todoist_tasks table", () => {
  it("inserts and retrieves a task", async () => {
    const task = {
      id: "td_001",
      content: "Review Eight Arms PR",
      description: "Check the database schema changes",
      projectId: "proj_001",
      projectName: "Work",
      priority: 1,
      dueDate: new Date("2026-03-31T17:00:00Z"),
      labels: ["code-review", "eight-arms"],
      isCompleted: false,
    };

    await testDb.insert(todoistTasks).values(task);
    const result = await testDb
      .select()
      .from(todoistTasks)
      .where(eq(todoistTasks.id, "td_001"));

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Review Eight Arms PR");
    expect(result[0].priority).toBe(1);
    expect(result[0].labels).toEqual(["code-review", "eight-arms"]);
  });

  it("filters by completion status", async () => {
    await testDb.insert(todoistTasks).values([
      {
        id: "td_002",
        content: "Done task",
        projectId: "proj_001",
        projectName: "Work",
        isCompleted: true,
      },
      {
        id: "td_003",
        content: "Open task",
        projectId: "proj_001",
        projectName: "Work",
        isCompleted: false,
      },
    ]);

    const active = await testDb
      .select()
      .from(todoistTasks)
      .where(eq(todoistTasks.isCompleted, false));

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("td_003");
  });
});
