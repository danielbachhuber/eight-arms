import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { emailGithubLinks, workNotes } from "../../src/db/schema/work.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { eq, and } from "drizzle-orm";

describe("email_github_links table", () => {
  it("links an email thread to a pull request", async () => {
    await testDb.insert(emails).values({
      id: "msg_010",
      threadId: "thread_010",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] Add feature (PR #42)",
      date: new Date("2026-03-30T10:00:00Z"),
    });

    await testDb.insert(githubPullRequests).values({
      id: "PR_node_010",
      repo: "acme/widget",
      number: 42,
      title: "Add feature",
      author: "alice",
      state: "OPEN",
      branch: "feature",
    });

    await testDb.insert(emailGithubLinks).values({
      emailThreadId: "thread_010",
      sourceType: "pull_request",
      sourceId: "PR_node_010",
      repo: "acme/widget",
      number: 42,
    });

    const result = await testDb
      .select()
      .from(emailGithubLinks)
      .where(eq(emailGithubLinks.emailThreadId, "thread_010"));

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("pull_request");
    expect(result[0].sourceId).toBe("PR_node_010");
  });
});

describe("work_notes table", () => {
  it("creates a note for a work item", async () => {
    await testDb.insert(workNotes).values({
      sourceType: "pull_request",
      sourceId: "PR_node_010",
      notes: "Need to check the error handling in the auth module",
      estimate: "1h",
      isActionable: true,
    });

    const result = await testDb
      .select()
      .from(workNotes)
      .where(
        and(
          eq(workNotes.sourceType, "pull_request"),
          eq(workNotes.sourceId, "PR_node_010")
        )
      );

    expect(result).toHaveLength(1);
    expect(result[0].notes).toBe(
      "Need to check the error handling in the auth module"
    );
    expect(result[0].estimate).toBe("1h");
    expect(result[0].isActionable).toBe(true);
  });

  it("updates existing notes", async () => {
    const [inserted] = await testDb
      .insert(workNotes)
      .values({
        sourceType: "issue",
        sourceId: "I_node_001",
        notes: "Initial notes",
        isActionable: false,
      })
      .returning();

    await testDb
      .update(workNotes)
      .set({ notes: "Refined notes", estimate: "30m", isActionable: true })
      .where(eq(workNotes.id, inserted.id));

    const result = await testDb
      .select()
      .from(workNotes)
      .where(eq(workNotes.id, inserted.id));

    expect(result[0].notes).toBe("Refined notes");
    expect(result[0].estimate).toBe("30m");
    expect(result[0].isActionable).toBe(true);
  });
});
