import { TodoistApi } from "@doist/todoist-api-typescript";
import type { Database } from "../db/index.js";
import { todoistTasks } from "../db/schema/todoist.js";
import { getCredentials } from "./credentials.js";

export async function syncTodoist(db: Database): Promise<{ synced: number }> {
  const cred = await getCredentials(db, "todoist");
  if (!cred) throw new Error("Todoist not connected");

  const api = new TodoistApi(cred.accessToken);

  // Fetch projects for name resolution
  const projectsResponse = await api.getProjects();
  const projectMap = new Map(projectsResponse.results.map((p) => [p.id, p.name]));

  // Fetch active tasks
  const tasksResponse = await api.getTasks();
  const tasks = tasksResponse.results;

  let synced = 0;

  for (const task of tasks) {
    const dueDate = task.due?.datetime
      ? new Date(task.due.datetime)
      : task.due?.date
        ? new Date(task.due.date)
        : null;

    await db
      .insert(todoistTasks)
      .values({
        id: task.id,
        content: task.content,
        description: task.description || "",
        projectId: task.projectId,
        projectName: projectMap.get(task.projectId) || "Unknown",
        priority: task.priority,
        dueDate,
        labels: task.labels,
        isCompleted: task.checked,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: todoistTasks.id,
        set: {
          content: task.content,
          description: task.description || "",
          projectName: projectMap.get(task.projectId) || "Unknown",
          priority: task.priority,
          dueDate,
          labels: task.labels,
          isCompleted: task.checked,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return { synced };
}
