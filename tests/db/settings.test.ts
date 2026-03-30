import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { oauthCredentials, syncConfig } from "../../src/db/schema/settings.js";
import { eq } from "drizzle-orm";

describe("oauth_credentials table", () => {
  it("stores and retrieves OAuth credentials", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "gmail",
      accessToken: "access_123",
      refreshToken: "refresh_456",
      expiresAt: new Date("2026-04-01T00:00:00Z"),
      scopes: "https://www.googleapis.com/auth/gmail.modify",
    });

    const result = await testDb
      .select()
      .from(oauthCredentials)
      .where(eq(oauthCredentials.service, "gmail"));

    expect(result).toHaveLength(1);
    expect(result[0].accessToken).toBe("access_123");
    expect(result[0].scopes).toBe(
      "https://www.googleapis.com/auth/gmail.modify"
    );
  });

  it("enforces unique service constraint", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "github",
      accessToken: "token_1",
      refreshToken: "refresh_1",
    });

    await expect(
      testDb.insert(oauthCredentials).values({
        service: "github",
        accessToken: "token_2",
        refreshToken: "refresh_2",
      })
    ).rejects.toThrow();
  });
});

describe("sync_config table", () => {
  it("stores sync configuration with defaults", async () => {
    await testDb.insert(syncConfig).values({
      service: "gmail",
    });

    const result = await testDb
      .select()
      .from(syncConfig)
      .where(eq(syncConfig.service, "gmail"));

    expect(result).toHaveLength(1);
    expect(result[0].intervalMinutes).toBe(5);
    expect(result[0].enabled).toBe(true);
    expect(result[0].lastSyncAt).toBeNull();
  });

  it("updates last sync timestamp", async () => {
    await testDb.insert(syncConfig).values({ service: "todoist" });

    const now = new Date();
    await testDb
      .update(syncConfig)
      .set({ lastSyncAt: now })
      .where(eq(syncConfig.service, "todoist"));

    const result = await testDb
      .select()
      .from(syncConfig)
      .where(eq(syncConfig.service, "todoist"));

    expect(result[0].lastSyncAt).toEqual(now);
  });
});
