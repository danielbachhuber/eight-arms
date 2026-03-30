import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

// Mock db to use testDb
vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

// Mock oauth-providers to avoid needing env vars
vi.mock("../../src/services/oauth-providers.js", () => ({
  getProvider: vi.fn().mockResolvedValue({
    clientId: "test-id",
    clientSecret: "test-secret",
    authUrl: "https://example.com/auth",
    tokenUrl: "https://example.com/token",
    scopes: ["test-scope"],
    redirectUri: "https://example.com/callback",
  }),
  ALL_SERVICES: ["gmail", "github", "todoist"],
}));

// Import app AFTER mocks are set up
const { app } = await import("../../src/server.js");

describe("settings routes", () => {
  it("GET /api/settings returns connection status", async () => {
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.services).toEqual({
      gmail: false,
      github: false,
      todoist: false,
    });
  });

  it("GET /api/settings shows connected services", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "gmail",
      accessToken: "token",
      refreshToken: "refresh",
    });

    const res = await app.request("/api/settings");
    const body = await res.json();
    expect(body.services.gmail).toBe(true);
    expect(body.services.github).toBe(false);
  });

  it("POST /api/settings/oauth/:service/start returns auth URL", async () => {
    const res = await app.request("/api/settings/oauth/gmail/start", {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toContain("https://example.com/auth");
    expect(body.url).toContain("client_id=test-id");
    expect(body.url).toContain("state=");
  });

  it("POST /api/settings/oauth/:service/start rejects invalid service", async () => {
    const res = await app.request("/api/settings/oauth/invalid/start", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });
});
