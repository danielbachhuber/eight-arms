import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

describe("todoist routes", () => {
  it("GET /api/todoist/tasks lists active tasks", async () => {
    await testDb.insert(todoistTasks).values({
      id: "td1",
      content: "Review PR",
      projectId: "p1",
      projectName: "Work",
      priority: 1,
      isCompleted: false,
    });

    const res = await app.request("/api/todoist/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].content).toBe("Review PR");
  });

  it("GET /api/todoist/tasks/:id returns 404 for missing", async () => {
    const res = await app.request("/api/todoist/tasks/nonexistent");
    expect(res.status).toBe(404);
  });
});
