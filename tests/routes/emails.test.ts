import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { emailGithubLinks } from "../../src/db/schema/work.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

async function seedEmails() {
  await testDb.insert(emails).values([
    {
      id: "e1",
      threadId: "t1",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      date: new Date("2026-03-30T10:00:00Z"),
      isRead: false,
    },
    {
      id: "e2",
      threadId: "t2",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] PR #42",
      date: new Date("2026-03-30T11:00:00Z"),
      isRead: true,
    },
  ]);
}

describe("email routes", () => {
  it("GET /api/emails lists emails", async () => {
    await seedEmails();
    const res = await app.request("/api/emails");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("GET /api/emails?unread=true filters unread", async () => {
    await seedEmails();
    const res = await app.request("/api/emails?unread=true");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("e1");
  });

  it("GET /api/emails/:id returns email with github data", async () => {
    await seedEmails();
    await testDb.insert(githubPullRequests).values({
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
    });
    await testDb.insert(emailGithubLinks).values({
      emailThreadId: "t2",
      sourceType: "pull_request",
      sourceId: "pr1",
      repo: "acme/widget",
      number: 42,
    });

    const res = await app.request("/api/emails/e2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.github).toHaveLength(1);
  });

  it("GET /api/emails/:id returns 404 for missing email", async () => {
    const res = await app.request("/api/emails/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/emails/:id/archive archives the email", async () => {
    await seedEmails();
    const res = await app.request("/api/emails/e1/archive", { method: "POST" });
    expect(res.status).toBe(200);

    const listRes = await app.request("/api/emails");
    const body = await listRes.json();
    expect(body.find((e: any) => e.id === "e1")).toBeUndefined();
  });
});
