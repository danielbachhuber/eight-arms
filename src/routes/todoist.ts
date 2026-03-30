import { Hono } from "hono";
import { db } from "../db/index.js";
import { listTodoistTasks, getTodoistTask } from "../services/queries.js";

const todoistRoutes = new Hono();

todoistRoutes.get("/tasks", async (c) => {
  const project = c.req.query("project");
  const priority = c.req.query("priority");
  const limit = c.req.query("limit");

  const result = await listTodoistTasks(db, {
    project: project || undefined,
    priority: priority ? parseInt(priority) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

todoistRoutes.get("/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getTodoistTask(db, id);
  if (!result) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(result);
});

export { todoistRoutes };
