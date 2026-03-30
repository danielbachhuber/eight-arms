import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import {
  listEmails,
  getEmail,
  archiveEmail,
  listPulls,
  getPull,
  listIssues,
  listTodoistTasks,
  listWork,
  getWorkNotes,
  saveWorkNotes,
} from "../../src/services/queries.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { emailGithubLinks } from "../../src/db/schema/work.js";

// Seed helper
async function seedData() {
  await testDb.insert(emails).values([
    {
      id: "e1",
      threadId: "t1",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      date: new Date("2026-03-30T10:00:00Z"),
      isRead: false,
      isArchived: false,
    },
    {
      id: "e2",
      threadId: "t2",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] Fix bug (PR #42)",
      date: new Date("2026-03-30T11:00:00Z"),
      isRead: false,
      isArchived: false,
    },
  ]);

  await testDb.insert(githubPullRequests).values({
    id: "pr1",
    repo: "acme/widget",
    number: 42,
    title: "Fix bug",
    author: "alice",
    state: "OPEN",
    branch: "fix-bug",
    reviewRequests: ["me"],
  });

  await testDb.insert(githubIssues).values({
    id: "i1",
    repo: "acme/widget",
    number: 10,
    title: "Bug report",
    author: "bob",
    state: "OPEN",
    assignees: ["me"],
    labels: ["bug"],
  });

  await testDb.insert(todoistTasks).values({
    id: "td1",
    content: "Review PR",
    projectId: "p1",
    projectName: "Work",
    priority: 1,
    isCompleted: false,
  });

  await testDb.insert(emailGithubLinks).values({
    emailThreadId: "t2",
    sourceType: "pull_request",
    sourceId: "pr1",
    repo: "acme/widget",
    number: 42,
  });
}

describe("queries", () => {
  describe("emails", () => {
    it("lists unread non-archived emails", async () => {
      await seedData();
      const result = await listEmails(testDb as any, { unread: true });
      expect(result).toHaveLength(2);
    });

    it("filters emails with github links", async () => {
      await seedData();
      const result = await listEmails(testDb as any, { hasGithubLink: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("e2");
    });

    it("gets email with linked github data", async () => {
      await seedData();
      const result = await getEmail(testDb as any, "e2");
      expect(result).not.toBeNull();
      expect(result!.github).toHaveLength(1);
      expect(result!.github[0].type).toBe("pull_request");
      expect(result!.github[0].data.title).toBe("Fix bug");
    });

    it("archives an email", async () => {
      await seedData();
      await archiveEmail(testDb as any, "e1");
      const result = await listEmails(testDb as any);
      expect(result.find((e) => e.id === "e1")).toBeUndefined();
    });
  });

  describe("github", () => {
    it("lists PRs filtered by repo", async () => {
      await seedData();
      const result = await listPulls(testDb as any, { repo: "acme/widget" });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Fix bug");
    });

    it("lists issues filtered by repo", async () => {
      await seedData();
      const result = await listIssues(testDb as any, { repo: "acme/widget" });
      expect(result).toHaveLength(1);
    });
  });

  describe("todoist", () => {
    it("lists active tasks", async () => {
      await seedData();
      const result = await listTodoistTasks(testDb as any);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Review PR");
    });
  });

  describe("work", () => {
    it("returns unified view of all work items", async () => {
      await seedData();
      const result = await listWork(testDb as any);
      expect(result.length).toBeGreaterThanOrEqual(4); // 1 PR + 1 issue + 1 task + 2 emails
    });

    it("filters by repo", async () => {
      await seedData();
      const result = await listWork(testDb as any, { repo: "acme/widget" });
      const prItems = result.filter((r) => r.sourceType === "pull_request");
      expect(prItems).toHaveLength(1);
    });

    it("filters by sourceType", async () => {
      await seedData();
      const result = await listWork(testDb as any, {
        sourceType: "todoist_task",
      });
      expect(result.every((r) => r.sourceType === "todoist_task")).toBe(true);
    });
  });

  describe("work notes", () => {
    it("saves and retrieves notes", async () => {
      await saveWorkNotes(testDb as any, {
        sourceType: "pull_request",
        sourceId: "pr1",
        notes: "Need to check auth module",
        estimate: "1h",
        isActionable: true,
      });

      const result = await getWorkNotes(testDb as any, "pull_request", "pr1");
      expect(result).not.toBeNull();
      expect(result!.notes).toBe("Need to check auth module");
      expect(result!.estimate).toBe("1h");
      expect(result!.isActionable).toBe(true);
    });

    it("updates existing notes", async () => {
      await saveWorkNotes(testDb as any, {
        sourceType: "issue",
        sourceId: "i1",
        notes: "Initial",
      });
      await saveWorkNotes(testDb as any, {
        sourceType: "issue",
        sourceId: "i1",
        notes: "Updated",
        estimate: "30m",
      });

      const result = await getWorkNotes(testDb as any, "issue", "i1");
      expect(result!.notes).toBe("Updated");
      expect(result!.estimate).toBe("30m");
    });
  });
});
