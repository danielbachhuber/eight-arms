import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

async function seedGithub() {
  await testDb.insert(githubPullRequests).values([
    {
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
      reviewRequests: ["me"],
    },
    {
      id: "pr2",
      repo: "acme/gadget",
      number: 7,
      title: "Add feature",
      author: "bob",
      state: "OPEN",
      branch: "feat",
    },
  ]);

  await testDb.insert(githubIssues).values({
    id: "i1",
    repo: "acme/widget",
    number: 10,
    title: "Bug report",
    author: "carol",
    state: "OPEN",
    assignees: ["me"],
    labels: ["bug"],
  });
}

describe("github routes", () => {
  it("GET /api/pulls lists all PRs", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("GET /api/pulls?repo= filters by repo", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls?repo=acme/widget");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Fix bug");
  });

  it("GET /api/pulls/:id returns single PR", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls/pr1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Fix bug");
  });

  it("GET /api/issues lists issues", async () => {
    await seedGithub();
    const res = await app.request("/api/issues");
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("GET /api/issues/:id returns 404 for missing", async () => {
    const res = await app.request("/api/issues/nonexistent");
    expect(res.status).toBe(404);
  });
});
