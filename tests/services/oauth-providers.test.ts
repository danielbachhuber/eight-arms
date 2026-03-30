import { describe, it, expect, beforeEach, vi } from "vitest";
import { getProvider, ALL_SERVICES } from "../../src/services/oauth-providers.js";

describe("oauth-providers", () => {
  beforeEach(() => {
    vi.stubEnv("GMAIL_CLIENT_ID", "gmail-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "gmail-secret");
    vi.stubEnv("GITHUB_CLIENT_ID", "github-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");
    vi.stubEnv("TODOIST_CLIENT_ID", "todoist-id");
    vi.stubEnv("TODOIST_CLIENT_SECRET", "todoist-secret");
    vi.stubEnv("OAUTH_REDIRECT_BASE", "http://localhost:3000");
  });

  it("returns Gmail provider config", () => {
    const provider = getProvider("gmail");
    expect(provider.clientId).toBe("gmail-id");
    expect(provider.authUrl).toContain("google");
    expect(provider.scopes).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(provider.redirectUri).toBe("http://localhost:3000/api/settings/oauth/gmail/callback");
  });

  it("returns GitHub provider config", () => {
    const provider = getProvider("github");
    expect(provider.clientId).toBe("github-id");
    expect(provider.authUrl).toContain("github");
    expect(provider.scopes).toContain("repo");
  });

  it("returns Todoist provider config", () => {
    const provider = getProvider("todoist");
    expect(provider.clientId).toBe("todoist-id");
    expect(provider.authUrl).toContain("todoist");
    expect(provider.scopes).toContain("data:read_write");
  });

  it("throws when env var is missing", () => {
    vi.unstubAllEnvs();
    delete process.env.GMAIL_CLIENT_ID;
    expect(() => getProvider("gmail")).toThrow("Missing environment variable: GMAIL_CLIENT_ID");
  });

  it("exports all service names", () => {
    expect(ALL_SERVICES).toEqual(["gmail", "github", "todoist"]);
  });
});
