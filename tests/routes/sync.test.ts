import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { app } from "../../src/server.js";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { oauthCredentials, syncConfig } from "../../src/db/schema/settings.js";
import { emails } from "../../src/db/schema/emails.js";

// Mock the db module to use testDb
vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

beforeAll(() => mockServer.listen({ onUnhandledRequest: "warn" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("sync routes", () => {
  it("POST /api/sync/trigger syncs connected services", async () => {
    // Only connect Gmail for this test
    await testDb.insert(oauthCredentials).values({
      service: "gmail",
      accessToken: "test-token",
      refreshToken: "test-refresh",
    });

    const res = await app.request("/api/sync/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: ["gmail"] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].service).toBe("gmail");
    expect(body.results[0].success).toBe(true);

    // Verify data was synced
    const storedEmails = await testDb.select().from(emails);
    expect(storedEmails.length).toBeGreaterThan(0);
  });

  it("POST /api/sync/trigger reports errors for unconnected services", async () => {
    const res = await app.request("/api/sync/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: ["github"] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain("not connected");
  });
});
