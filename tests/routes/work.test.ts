import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { workNotes } from "../../src/db/schema/work.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

describe("work routes", () => {
  it("GET /api/work returns unified work items", async () => {
    await testDb.insert(githubPullRequests).values({
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
    });

    const res = await app.request("/api/work");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/work/notes saves notes", async () => {
    const res = await app.request("/api/work/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: "pull_request",
        sourceId: "pr1",
        notes: "Check auth module",
        estimate: "1h",
        isActionable: true,
      }),
    });
    expect(res.status).toBe(200);

    const getRes = await app.request(
      "/api/work/notes?sourceType=pull_request&sourceId=pr1"
    );
    const body = await getRes.json();
    expect(body.notes).toBe("Check auth module");
  });

  it("GET /api/work/notes returns 400 without params", async () => {
    const res = await app.request("/api/work/notes");
    expect(res.status).toBe(400);
  });
});
