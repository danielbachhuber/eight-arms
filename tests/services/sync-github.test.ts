import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { syncGithub } from "../../src/services/sync-github.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

// Mock the authenticated user endpoint
import { http, HttpResponse } from "msw";

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: "error" });
  // Add the authenticated user handler
  mockServer.use(
    http.get("https://api.github.com/user", () => {
      return HttpResponse.json({ login: "me", id: 12345 });
    })
  );
});
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("syncGithub", () => {
  it("fetches PRs and issues and stores them", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "github",
      accessToken: "gh-test-token",
      refreshToken: "gh-test-refresh",
    });

    const result = await syncGithub(testDb as any);

    expect(result.prs).toBe(1);
    expect(result.issues).toBe(1);

    const prs = await testDb.select().from(githubPullRequests);
    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe("Add feature X");
    expect(prs[0].repo).toBe("acme/widget");
    expect(prs[0].files).toHaveLength(2);
    expect(prs[0].ciStatus).toBe("success");

    const issues = await testDb.select().from(githubIssues);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe("Bug: login broken");
    expect(issues[0].labels).toContain("bug");
  });

  it("throws when GitHub is not connected", async () => {
    await expect(syncGithub(testDb as any)).rejects.toThrow("GitHub not connected");
  });
});
