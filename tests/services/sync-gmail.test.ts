import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { syncGmail } from "../../src/services/sync-gmail.js";
import { emails } from "../../src/db/schema/emails.js";
import { emailGithubLinks } from "../../src/db/schema/work.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("syncGmail", () => {
  it("fetches emails and stores them in the database", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "gmail",
      accessToken: "test-token",
      refreshToken: "test-refresh",
    });

    const result = await syncGmail(testDb as any);

    expect(result.synced).toBe(2);

    const stored = await testDb.select().from(emails);
    expect(stored).toHaveLength(2);

    const regularEmail = stored.find((e) => e.id === "msg_gmail_001");
    expect(regularEmail).toBeDefined();
    expect(regularEmail!.from).toContain("alice@example.com");
    expect(regularEmail!.subject).toBe("Quick sync");

    const githubEmail = stored.find((e) => e.id === "msg_gmail_002");
    expect(githubEmail).toBeDefined();
    expect(githubEmail!.from).toContain("notifications@github.com");
  });

  it("creates email-github links for GitHub notification emails", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "gmail",
      accessToken: "test-token",
      refreshToken: "test-refresh",
    });

    await syncGmail(testDb as any);

    const links = await testDb.select().from(emailGithubLinks);
    expect(links).toHaveLength(1);
    expect(links[0].repo).toBe("acme/widget");
    expect(links[0].number).toBe(42);
    expect(links[0].sourceType).toBe("pull_request");
  });

  it("throws when Gmail is not connected", async () => {
    await expect(syncGmail(testDb as any)).rejects.toThrow("Gmail not connected");
  });
});
