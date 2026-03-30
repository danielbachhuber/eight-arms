import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { syncTodoist } from "../../src/services/sync-todoist.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("syncTodoist", () => {
  it("fetches tasks and stores them with project names", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "todoist",
      accessToken: "td-test-token",
      refreshToken: "td-test-refresh",
    });

    const result = await syncTodoist(testDb as any);

    expect(result.synced).toBe(2);

    const stored = await testDb.select().from(todoistTasks);
    expect(stored).toHaveLength(2);

    const task1 = stored.find((t) => t.id === "td_api_001");
    expect(task1).toBeDefined();
    expect(task1!.content).toBe("Review Eight Arms PR");
    expect(task1!.projectName).toBe("Work");
    expect(task1!.labels).toEqual(["code-review"]);
    expect(task1!.dueDate).toBeDefined();

    const task2 = stored.find((t) => t.id === "td_api_002");
    expect(task2).toBeDefined();
    expect(task2!.projectName).toBe("Personal");
    expect(task2!.dueDate).toBeNull();
  });

  it("throws when Todoist is not connected", async () => {
    await expect(syncTodoist(testDb as any)).rejects.toThrow("Todoist not connected");
  });
});
