import { describe, it, expect, vi } from "vitest";
import { testDb } from "./setup.js";
import { emails } from "../src/db/schema/emails.js";
import { githubPullRequests } from "../src/db/schema/github.js";
import {
  listEmails,
  getEmail,
  listPulls,
  listWork,
  saveWorkNotes,
  getWorkNotes,
} from "../src/services/queries.js";

describe("MCP tool queries", () => {
  it("list_emails query returns expected shape", async () => {
    await testDb.insert(emails).values({
      id: "mcp_e1",
      threadId: "mcp_t1",
      from: "test@example.com",
      to: "me@example.com",
      subject: "MCP Test",
      date: new Date(),
      isRead: false,
    });

    const result = await listEmails(testDb as any, { unread: true });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("from");
    expect(result[0]).toHaveProperty("subject");
  });

  it("list_pulls query returns expected shape", async () => {
    await testDb.insert(githubPullRequests).values({
      id: "mcp_pr1",
      repo: "test/repo",
      number: 1,
      title: "Test PR",
      author: "tester",
      state: "OPEN",
      branch: "test",
    });

    const result = await listPulls(testDb as any, { repo: "test/repo" });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("files");
    expect(result[0]).toHaveProperty("reviewRequests");
  });

  it("save_work_notes and get_work_notes round-trip", async () => {
    await saveWorkNotes(testDb as any, {
      sourceType: "pull_request",
      sourceId: "mcp_pr1",
      notes: "MCP test notes",
      estimate: "15m",
      isActionable: true,
    });

    const result = await getWorkNotes(testDb as any, "pull_request", "mcp_pr1");
    expect(result).not.toBeNull();
    expect(result!.notes).toBe("MCP test notes");
    expect(result!.estimate).toBe("15m");
  });

  it("list_work includes items from multiple sources", async () => {
    await testDb.insert(emails).values({
      id: "mcp_e2",
      threadId: "mcp_t2",
      from: "work@example.com",
      to: "me@example.com",
      subject: "Work email",
      date: new Date(),
      isRead: false,
    });

    await testDb.insert(githubPullRequests).values({
      id: "mcp_pr2",
      repo: "test/repo",
      number: 2,
      title: "Another PR",
      author: "dev",
      state: "OPEN",
      branch: "feature",
    });

    const result = await listWork(testDb as any);
    const types = new Set(result.map((r) => r.sourceType));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });
});
