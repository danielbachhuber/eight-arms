import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  getConnectionStatus,
} from "../../src/services/credentials.js";
import type { TokenResponse } from "../../src/services/oauth.js";

// Mock the oauth module to prevent actual HTTP calls during refresh
vi.mock("../../src/services/oauth.js", () => ({
  refreshAccessToken: vi.fn(),
}));

// Mock oauth-providers to avoid needing env vars
vi.mock("../../src/services/oauth-providers.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/oauth-providers.js")>();
  return {
    ...original,
    getProvider: vi.fn().mockReturnValue({
      clientId: "test-id",
      clientSecret: "test-secret",
      authUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      scopes: ["test"],
      redirectUri: "http://localhost:3000/callback",
    }),
  };
});

const tokens: TokenResponse = {
  accessToken: "access_123",
  refreshToken: "refresh_456",
  expiresAt: new Date("2026-04-01T00:00:00Z"),
  scopes: "email",
};

describe("credentials service", () => {
  it("saves and retrieves credentials", async () => {
    await saveCredentials(testDb as any, "gmail", tokens);
    const result = await getCredentials(testDb as any, "gmail");

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("access_123");
    expect(result!.refreshToken).toBe("refresh_456");
  });

  it("returns null for unconnected service", async () => {
    const result = await getCredentials(testDb as any, "github");
    expect(result).toBeNull();
  });

  it("upserts on save (updates existing)", async () => {
    await saveCredentials(testDb as any, "gmail", tokens);
    await saveCredentials(testDb as any, "gmail", {
      ...tokens,
      accessToken: "new_access",
    });

    const result = await getCredentials(testDb as any, "gmail");
    expect(result!.accessToken).toBe("new_access");
  });

  it("deletes credentials", async () => {
    await saveCredentials(testDb as any, "gmail", tokens);
    await deleteCredentials(testDb as any, "gmail");
    const result = await getCredentials(testDb as any, "gmail");
    expect(result).toBeNull();
  });

  it("returns connection status for all services", async () => {
    await saveCredentials(testDb as any, "gmail", tokens);
    await saveCredentials(testDb as any, "todoist", tokens);

    const status = await getConnectionStatus(testDb as any);
    expect(status).toEqual({
      gmail: true,
      github: false,
      todoist: true,
    });
  });
});
