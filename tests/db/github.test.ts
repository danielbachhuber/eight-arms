import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";
import { eq } from "drizzle-orm";

describe("github_pull_requests table", () => {
  it("inserts and retrieves a pull request", async () => {
    const pr = {
      id: "PR_node_001",
      repo: "acme/widget",
      number: 42,
      title: "Add feature X",
      author: "alice",
      state: "OPEN",
      isDraft: false,
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: ["bob", "carol"],
      additions: 150,
      deletions: 30,
      files: [
        { path: "src/feature.ts", additions: 100, deletions: 20 },
        { path: "tests/feature.test.ts", additions: 50, deletions: 10 },
      ],
      ciStatus: "SUCCESS",
      branch: "feature-x",
      body: "This adds feature X",
    };

    await testDb.insert(githubPullRequests).values(pr);
    const result = await testDb
      .select()
      .from(githubPullRequests)
      .where(eq(githubPullRequests.id, "PR_node_001"));

    expect(result).toHaveLength(1);
    expect(result[0].repo).toBe("acme/widget");
    expect(result[0].reviewRequests).toEqual(["bob", "carol"]);
    expect(result[0].files).toHaveLength(2);
    expect(result[0].files[0].path).toBe("src/feature.ts");
  });

  it("filters PRs by repo", async () => {
    await testDb.insert(githubPullRequests).values([
      {
        id: "PR_node_002",
        repo: "acme/widget",
        number: 1,
        title: "PR in widget",
        author: "alice",
        state: "OPEN",
        branch: "fix-1",
      },
      {
        id: "PR_node_003",
        repo: "acme/gadget",
        number: 2,
        title: "PR in gadget",
        author: "bob",
        state: "OPEN",
        branch: "fix-2",
      },
    ]);

    const result = await testDb
      .select()
      .from(githubPullRequests)
      .where(eq(githubPullRequests.repo, "acme/widget"));

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("PR in widget");
  });
});

describe("github_issues table", () => {
  it("inserts and retrieves an issue", async () => {
    const issue = {
      id: "I_node_001",
      repo: "acme/widget",
      number: 10,
      title: "Bug: login broken",
      author: "carol",
      state: "OPEN",
      assignees: ["alice"],
      labels: ["bug", "critical"],
      body: "Login page returns 500",
    };

    await testDb.insert(githubIssues).values(issue);
    const result = await testDb
      .select()
      .from(githubIssues)
      .where(eq(githubIssues.id, "I_node_001"));

    expect(result).toHaveLength(1);
    expect(result[0].assignees).toEqual(["alice"]);
    expect(result[0].labels).toEqual(["bug", "critical"]);
  });
});
