# Plan 2: OAuth + Sync System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable OAuth2 authentication with Gmail, GitHub, and Todoist, then build sync services that fetch data from each API and store it in Postgres on a cron schedule.

**Architecture:** A shared OAuth service handles the redirect-based flow for all three providers. Each provider has its own sync service that fetches data via the provider's API and upserts into the corresponding DB tables. Settings API endpoints manage OAuth flows and connection status. A cron job in the container triggers syncs on a configurable interval. External APIs are mocked with `msw` in tests.

**Tech Stack:** googleapis (Gmail), @octokit/rest (GitHub), @doist/todoist-api-typescript (Todoist), msw (test mocking), node-cron (in-process scheduler as alternative to system cron)

---

## File Structure

```
eight-arms/
├── src/
│   ├── server.ts                          — (modify) Mount settings + sync routes
│   ├── services/
│   │   ├── oauth.ts                       — Generic OAuth helper: build auth URL, exchange code, refresh token
│   │   ├── oauth-providers.ts             — Provider configs: client IDs, scopes, endpoints for Gmail/GitHub/Todoist
│   │   ├── credentials.ts                 — Read/write/refresh credentials from DB
│   │   ├── sync-gmail.ts                  — Gmail sync: fetch inbox messages, detect GitHub links
│   │   ├── sync-github.ts                 — GitHub sync: fetch PRs + issues
│   │   ├── sync-todoist.ts                — Todoist sync: fetch active tasks
│   │   └── sync-runner.ts                 — Orchestrates running all sync jobs, updates sync_config
│   ├── routes/
│   │   ├── settings.ts                    — GET /api/settings, OAuth start/callback routes
│   │   └── sync.ts                        — POST /api/sync/trigger
│   └── cron.ts                            — In-process cron scheduler using node-cron
├── tests/
│   ├── mocks/
│   │   ├── handlers.ts                    — msw request handlers for Gmail, GitHub, Todoist APIs
│   │   └── server.ts                      — msw server setup
│   ├── services/
│   │   ├── sync-gmail.test.ts             — Gmail sync integration tests
│   │   ├── sync-github.test.ts            — GitHub sync integration tests
│   │   ├── sync-todoist.test.ts           — Todoist sync integration tests
│   │   └── credentials.test.ts            — Credential storage tests
│   └── routes/
│       ├── settings.test.ts               — Settings API endpoint tests
│       └── sync.test.ts                   — Sync trigger endpoint tests
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
pnpm add googleapis @octokit/rest @doist/todoist-api-typescript node-cron
```

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D msw @types/node-cron
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add googleapis, octokit, todoist-api, node-cron, msw dependencies"
```

---

### Task 2: OAuth Provider Configuration

**Files:**
- Create: `src/services/oauth-providers.ts`
- Create: `tests/services/oauth-providers.test.ts`

- [ ] **Step 1: Create src/services/oauth-providers.ts**

This file defines the OAuth endpoints, scopes, and configuration for each provider. Client IDs and secrets come from environment variables.

```ts
import { z } from "zod";

export const oauthProviderSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  authUrl: z.string(),
  tokenUrl: z.string(),
  scopes: z.array(z.string()),
  redirectUri: z.string(),
});

export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

const baseRedirectUri = process.env.OAUTH_REDIRECT_BASE || "http://localhost:3000";

export function getProvider(service: "gmail" | "github" | "todoist"): OAuthProvider {
  switch (service) {
    case "gmail":
      return {
        clientId: env("GMAIL_CLIENT_ID"),
        clientSecret: env("GMAIL_CLIENT_SECRET"),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.readonly",
        ],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/gmail/callback`,
      };
    case "github":
      return {
        clientId: env("GITHUB_CLIENT_ID"),
        clientSecret: env("GITHUB_CLIENT_SECRET"),
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: ["repo", "read:org", "notifications"],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/github/callback`,
      };
    case "todoist":
      return {
        clientId: env("TODOIST_CLIENT_ID"),
        clientSecret: env("TODOIST_CLIENT_SECRET"),
        authUrl: "https://todoist.com/oauth/authorize",
        tokenUrl: "https://todoist.com/oauth/access_token",
        scopes: ["data:read_write"],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/todoist/callback`,
      };
  }
}

export type ServiceName = "gmail" | "github" | "todoist";
export const ALL_SERVICES: ServiceName[] = ["gmail", "github", "todoist"];
```

- [ ] **Step 2: Write the test — tests/services/oauth-providers.test.ts**

```ts
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
    vi.stubEnv("GMAIL_CLIENT_ID", "");
    vi.unstubAllEnvs();
    // Remove the env var
    delete process.env.GMAIL_CLIENT_ID;
    expect(() => getProvider("gmail")).toThrow("Missing environment variable: GMAIL_CLIENT_ID");
  });

  it("exports all service names", () => {
    expect(ALL_SERVICES).toEqual(["gmail", "github", "todoist"]);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/oauth-providers.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/oauth-providers.ts tests/services/oauth-providers.test.ts
git commit -m "feat: add OAuth provider configuration for Gmail, GitHub, Todoist"
```

---

### Task 3: OAuth Flow Service

**Files:**
- Create: `src/services/oauth.ts`

- [ ] **Step 1: Create src/services/oauth.ts**

This handles the generic OAuth2 flow: building auth URLs, exchanging codes for tokens, and refreshing tokens.

```ts
import type { OAuthProvider } from "./oauth-providers.js";

export function buildAuthUrl(provider: OAuthProvider, state: string): string {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scopes.join(" "),
    state,
    response_type: "code",
  });

  // Google requires these extra params for refresh tokens
  if (provider.authUrl.includes("google")) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  return `${provider.authUrl}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  scopes: string;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: provider.redirectUri,
    grant_type: "authorization_code",
  };

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return parseTokenResponse(data);
}

export async function refreshAccessToken(
  provider: OAuthProvider,
  refreshToken: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    ...parseTokenResponse(data),
    // Refresh token may not be returned on refresh; keep the original
    refreshToken: data.refresh_token || refreshToken,
  };
}

function parseTokenResponse(data: Record<string, unknown>): TokenResponse {
  const accessToken = data.access_token as string;
  const refreshToken = (data.refresh_token as string) || "";
  const expiresIn = data.expires_in as number | undefined;
  const scopes = (data.scope as string) || "";

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/oauth.ts
git commit -m "feat: add generic OAuth2 flow service (auth URL, code exchange, refresh)"
```

---

### Task 4: Credential Storage Service

**Files:**
- Create: `src/services/credentials.ts`
- Create: `tests/services/credentials.test.ts`

- [ ] **Step 1: Create src/services/credentials.ts**

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { oauthCredentials } from "../db/schema/settings.js";
import type { ServiceName } from "./oauth-providers.js";
import { getProvider } from "./oauth-providers.js";
import { refreshAccessToken, type TokenResponse } from "./oauth.js";

export async function getCredentials(
  db: Database,
  service: ServiceName
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null } | null> {
  const [cred] = await db
    .select()
    .from(oauthCredentials)
    .where(eq(oauthCredentials.service, service));

  if (!cred) return null;

  // If token is expired or expiring within 5 minutes, refresh it
  if (cred.expiresAt && cred.expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    const provider = getProvider(service);
    const refreshed = await refreshAccessToken(provider, cred.refreshToken);
    await saveCredentials(db, service, refreshed);
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
  }

  return {
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
  };
}

export async function saveCredentials(
  db: Database,
  service: ServiceName,
  tokens: TokenResponse
): Promise<void> {
  await db
    .insert(oauthCredentials)
    .values({
      service,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    })
    .onConflictDoUpdate({
      target: oauthCredentials.service,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      },
    });
}

export async function deleteCredentials(
  db: Database,
  service: ServiceName
): Promise<void> {
  await db
    .delete(oauthCredentials)
    .where(eq(oauthCredentials.service, service));
}

export async function getConnectionStatus(
  db: Database
): Promise<Record<ServiceName, boolean>> {
  const creds = await db.select().from(oauthCredentials);
  const connected = new Set(creds.map((c) => c.service));
  return {
    gmail: connected.has("gmail"),
    github: connected.has("github"),
    todoist: connected.has("todoist"),
  };
}
```

- [ ] **Step 2: Write the test — tests/services/credentials.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testDb } from "../setup.js";
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  getConnectionStatus,
} from "../../src/services/credentials.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";
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
```

- [ ] **Step 3: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/credentials.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/credentials.ts tests/services/credentials.test.ts
git commit -m "feat: add credential storage service with DB upsert and connection status"
```

---

### Task 5: Settings API Routes

**Files:**
- Create: `src/routes/settings.ts`
- Modify: `src/server.ts`
- Create: `tests/routes/settings.test.ts`

- [ ] **Step 1: Create src/routes/settings.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { getConnectionStatus, saveCredentials } from "../services/credentials.js";
import { getProvider, type ServiceName } from "../services/oauth-providers.js";
import { buildAuthUrl, exchangeCode } from "../services/oauth.js";
import crypto from "node:crypto";

const settings = new Hono();

// In-memory state store for OAuth CSRF protection
const oauthStates = new Map<string, { service: ServiceName; expiresAt: number }>();

settings.get("/", async (c) => {
  const status = await getConnectionStatus(db);
  return c.json({ services: status });
});

settings.post("/oauth/:service/start", async (c) => {
  const service = c.req.param("service") as ServiceName;
  if (!["gmail", "github", "todoist"].includes(service)) {
    return c.json({ error: "Invalid service" }, 400);
  }

  const provider = getProvider(service);
  const state = crypto.randomBytes(32).toString("hex");
  oauthStates.set(state, { service, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = buildAuthUrl(provider, state);
  return c.json({ url });
});

settings.get("/oauth/:service/callback", async (c) => {
  const service = c.req.param("service") as ServiceName;
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const stored = oauthStates.get(state);
  if (!stored || stored.service !== service || stored.expiresAt < Date.now()) {
    return c.json({ error: "Invalid or expired state" }, 400);
  }
  oauthStates.delete(state);

  const provider = getProvider(service);
  const tokens = await exchangeCode(provider, code);
  await saveCredentials(db, service, tokens);

  // Redirect to settings page after successful auth
  return c.redirect("/settings?connected=" + service);
});

export { settings };
```

- [ ] **Step 2: Modify src/server.ts to mount the settings routes**

Add to `src/server.ts`:

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { settings } from "./routes/settings.js";

export const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/settings", settings);

const port = parseInt(process.env.PORT || "3000", 10);

if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
}
```

- [ ] **Step 3: Write the test — tests/routes/settings.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../src/server.js";
import { testDb } from "../setup.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

// Mock the db module to use testDb
vi.mock("../../src/db/index.js", () => ({
  db: (async () => {
    const { testDb } = await import("../setup.js");
    return testDb;
  })(),
}));

// Mock oauth-providers to avoid needing env vars
vi.mock("../../src/services/oauth-providers.js", () => ({
  getProvider: vi.fn().mockReturnValue({
    clientId: "test-id",
    clientSecret: "test-secret",
    authUrl: "https://example.com/auth",
    tokenUrl: "https://example.com/token",
    scopes: ["test-scope"],
    redirectUri: "http://localhost:3000/api/settings/oauth/gmail/callback",
  }),
  ALL_SERVICES: ["gmail", "github", "todoist"],
}));

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
```

- [ ] **Step 4: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/routes/settings.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.ts src/server.ts tests/routes/settings.test.ts
git commit -m "feat: add settings API routes with OAuth flow initiation"
```

---

### Task 6: MSW Test Infrastructure

**Files:**
- Create: `tests/mocks/handlers.ts`
- Create: `tests/mocks/server.ts`

- [ ] **Step 1: Create tests/mocks/handlers.ts**

Mock handlers for Gmail, GitHub, and Todoist APIs. These return realistic fixture data.

```ts
import { http, HttpResponse } from "msw";

// --- Gmail API mocks ---

export const gmailHandlers = [
  // List messages
  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    return HttpResponse.json({
      messages: [
        { id: "msg_gmail_001", threadId: "thread_gmail_001" },
        { id: "msg_gmail_002", threadId: "thread_gmail_002" },
      ],
      resultSizeEstimate: 2,
    });
  }),

  // Get single message
  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/:id", ({ params }) => {
    const id = params.id as string;
    const isGithub = id === "msg_gmail_002";

    return HttpResponse.json({
      id,
      threadId: isGithub ? "thread_gmail_002" : "thread_gmail_001",
      snippet: isGithub ? "Review requested on PR #42" : "Hey, can we sync up?",
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        headers: [
          { name: "From", value: isGithub ? "notifications@github.com" : "alice@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: isGithub ? "[acme/widget] Add feature (PR #42)" : "Quick sync" },
          { name: "Date", value: "Mon, 30 Mar 2026 10:00:00 +0000" },
        ],
        body: { data: btoa(isGithub ? "Please review PR #42" : "Hey, can we sync up tomorrow?") },
      },
      internalDate: "1743328800000",
    });
  }),

  // Modify message (archive)
  http.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/:id/modify", () => {
    return HttpResponse.json({ id: "msg_gmail_001", labelIds: [] });
  }),
];

// --- GitHub API mocks ---

export const githubHandlers = [
  // Search PRs where user is requested reviewer
  http.get("https://api.github.com/search/issues", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    if (q.includes("review-requested")) {
      return HttpResponse.json({
        total_count: 1,
        items: [
          {
            id: 1001,
            node_id: "PR_node_gh_001",
            number: 42,
            title: "Add feature X",
            state: "open",
            draft: false,
            user: { login: "alice" },
            pull_request: { url: "https://api.github.com/repos/acme/widget/pulls/42" },
            repository_url: "https://api.github.com/repos/acme/widget",
          },
        ],
      });
    }

    // Assigned issues
    return HttpResponse.json({
      total_count: 1,
      items: [
        {
          id: 2001,
          node_id: "I_node_gh_001",
          number: 10,
          title: "Bug: login broken",
          state: "open",
          user: { login: "carol" },
          assignees: [{ login: "me" }],
          labels: [{ name: "bug" }],
          repository_url: "https://api.github.com/repos/acme/widget",
        },
      ],
    });
  }),

  // Get single PR detail
  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number", () => {
    return HttpResponse.json({
      id: 1001,
      node_id: "PR_node_gh_001",
      number: 42,
      title: "Add feature X",
      state: "open",
      draft: false,
      user: { login: "alice" },
      head: { ref: "feature-x" },
      base: { ref: "main" },
      body: "This adds feature X",
      additions: 150,
      deletions: 30,
      changed_files: 2,
      merged_at: null,
      merged_by: null,
      requested_reviewers: [{ login: "bob" }, { login: "carol" }],
    });
  }),

  // Get PR files
  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number/files", () => {
    return HttpResponse.json([
      { filename: "src/feature.ts", additions: 100, deletions: 20 },
      { filename: "tests/feature.test.ts", additions: 50, deletions: 10 },
    ]);
  }),

  // Get PR status checks
  http.get("https://api.github.com/repos/:owner/:repo/commits/:ref/status", () => {
    return HttpResponse.json({ state: "success" });
  }),

  // Get PR reviews
  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number/reviews", () => {
    return HttpResponse.json([]);
  }),
];

// --- Todoist API mocks ---

export const todoistHandlers = [
  // Get active tasks
  http.get("https://api.todoist.com/rest/v2/tasks", () => {
    return HttpResponse.json([
      {
        id: "td_api_001",
        content: "Review Eight Arms PR",
        description: "Check schema changes",
        project_id: "proj_001",
        priority: 4,
        due: { date: "2026-03-31", datetime: "2026-03-31T17:00:00Z" },
        labels: ["code-review"],
        is_completed: false,
      },
      {
        id: "td_api_002",
        content: "Write documentation",
        description: "",
        project_id: "proj_002",
        priority: 3,
        due: null,
        labels: [],
        is_completed: false,
      },
    ]);
  }),

  // Get projects (for resolving project names)
  http.get("https://api.todoist.com/rest/v2/projects", () => {
    return HttpResponse.json([
      { id: "proj_001", name: "Work" },
      { id: "proj_002", name: "Personal" },
    ]);
  }),
];

export const allHandlers = [...gmailHandlers, ...githubHandlers, ...todoistHandlers];
```

- [ ] **Step 2: Create tests/mocks/server.ts**

```ts
import { setupServer } from "msw/node";
import { allHandlers } from "./handlers.js";

export const mockServer = setupServer(...allHandlers);
```

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/handlers.ts tests/mocks/server.ts
git commit -m "feat: add msw mock handlers for Gmail, GitHub, and Todoist APIs"
```

---

### Task 7: Gmail Sync Service

**Files:**
- Create: `src/services/sync-gmail.ts`
- Create: `tests/services/sync-gmail.test.ts`

- [ ] **Step 1: Create src/services/sync-gmail.ts**

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { emails } from "../db/schema/emails.js";
import { emailGithubLinks } from "../db/schema/work.js";
import { getCredentials } from "./credentials.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${GMAIL_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

export async function syncGmail(db: Database): Promise<{ synced: number }> {
  const cred = await getCredentials(db, "gmail");
  if (!cred) throw new Error("Gmail not connected");

  // Fetch message list
  const listData = await gmailFetch(cred.accessToken, "/messages", {
    q: "in:inbox",
    maxResults: "100",
  });

  const messageIds: { id: string; threadId: string }[] = listData.messages || [];
  if (messageIds.length === 0) return { synced: 0 };

  let synced = 0;

  for (const { id } of messageIds) {
    const msg = await gmailFetch(cred.accessToken, `/messages/${id}`, {
      format: "full",
    });

    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: { name: string; value: string }) => h.name === name)?.value || "";

    const from = getHeader("From");
    const to = getHeader("To");
    const subject = getHeader("Subject");
    const dateStr = getHeader("Date");
    const body = msg.payload?.body?.data
      ? Buffer.from(msg.payload.body.data, "base64").toString("utf-8")
      : "";

    const labelIds: string[] = msg.labelIds || [];

    await db
      .insert(emails)
      .values({
        id: msg.id,
        threadId: msg.threadId,
        from,
        to,
        subject,
        snippet: msg.snippet || "",
        body,
        date: dateStr ? new Date(dateStr) : new Date(parseInt(msg.internalDate)),
        labels: labelIds,
        isRead: !labelIds.includes("UNREAD"),
        isArchived: !labelIds.includes("INBOX"),
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emails.id,
        set: {
          labels: labelIds,
          isRead: !labelIds.includes("UNREAD"),
          isArchived: !labelIds.includes("INBOX"),
          syncedAt: new Date(),
        },
      });

    // Detect GitHub notification emails and create links
    if (from.includes("notifications@github.com")) {
      await detectAndLinkGithub(db, msg.threadId, subject);
    }

    synced++;
  }

  return { synced };
}

async function detectAndLinkGithub(
  db: Database,
  threadId: string,
  subject: string
): Promise<void> {
  // Extract repo from [owner/repo] pattern
  const repoMatch = subject.match(/\[([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\]/);
  if (!repoMatch) return;
  const repo = repoMatch[1];

  // Extract PR number from (PR #NNN) pattern
  const prMatch = subject.match(/\(PR #(\d+)\)/);
  if (prMatch) {
    const number = parseInt(prMatch[1]);
    await db
      .insert(emailGithubLinks)
      .values({
        emailThreadId: threadId,
        sourceType: "pull_request",
        sourceId: `${repo}#${number}`,
        repo,
        number,
      })
      .onConflictDoNothing(); // Requires a unique index — implementer should add a unique index on (email_thread_id, source_type, source_id) to the emailGithubLinks table via a new migration
    return;
  }

  // Extract Issue number from (Issue #NNN) pattern
  const issueMatch = subject.match(/\(Issue #(\d+)\)/);
  if (issueMatch) {
    const number = parseInt(issueMatch[1]);
    await db
      .insert(emailGithubLinks)
      .values({
        emailThreadId: threadId,
        sourceType: "issue",
        sourceId: `${repo}#${number}`,
        repo,
        number,
      })
      .onConflictDoNothing(); // Requires a unique index — implementer should add a unique index on (email_thread_id, source_type, source_id) to the emailGithubLinks table via a new migration
  }
}
```

- [ ] **Step 2: Write the test — tests/services/sync-gmail.test.ts**

```ts
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
    // Set up credentials
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
```

- [ ] **Step 3: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/sync-gmail.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/sync-gmail.ts tests/services/sync-gmail.test.ts
git commit -m "feat: add Gmail sync service with GitHub notification detection"
```

---

### Task 8: GitHub Sync Service

**Files:**
- Create: `src/services/sync-github.ts`
- Create: `tests/services/sync-github.test.ts`

- [ ] **Step 1: Create src/services/sync-github.ts**

```ts
import { Octokit } from "@octokit/rest";
import type { Database } from "../db/index.js";
import { githubPullRequests, githubIssues } from "../db/schema/github.js";
import { getCredentials } from "./credentials.js";

export async function syncGithub(db: Database): Promise<{ prs: number; issues: number }> {
  const cred = await getCredentials(db, "github");
  if (!cred) throw new Error("GitHub not connected");

  const octokit = new Octokit({ auth: cred.accessToken });

  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();
  const username = user.login;

  const prs = await syncPullRequests(db, octokit, username);
  const issues = await syncIssues(db, octokit, username);

  return { prs, issues };
}

async function syncPullRequests(
  db: Database,
  octokit: Octokit,
  username: string
): Promise<number> {
  // Fetch PRs where user is a requested reviewer
  const { data: searchResult } = await octokit.search.issuesAndPullRequests({
    q: `is:pr is:open review-requested:${username}`,
    per_page: 100,
  });

  let synced = 0;

  for (const item of searchResult.items) {
    // Extract owner/repo from repository_url
    const repoUrl = item.repository_url || "";
    const repoMatch = repoUrl.match(/repos\/(.+)$/);
    if (!repoMatch) continue;
    const repo = repoMatch[1]; // "owner/repo"
    const [owner, repoName] = repo.split("/");

    // Fetch full PR detail
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: item.number,
    });

    // Fetch files
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: item.number,
    });

    // Fetch combined status
    const { data: status } = await octokit.repos.getCombinedStatusForRef({
      owner,
      repo: repoName,
      ref: pr.head.ref,
    });

    await db
      .insert(githubPullRequests)
      .values({
        id: pr.node_id,
        repo,
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || "",
        state: pr.state.toUpperCase(),
        isDraft: pr.draft || false,
        reviewDecision: null, // Would need GraphQL for this
        reviewRequests: (pr.requested_reviewers || []).map((r: any) => r.login),
        additions: pr.additions,
        deletions: pr.deletions,
        files: files.map((f) => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
        })),
        ciStatus: status.state,
        branch: pr.head.ref,
        body: pr.body || "",
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        mergedBy: pr.merged_by?.login || null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: githubPullRequests.id,
        set: {
          state: pr.state.toUpperCase(),
          isDraft: pr.draft || false,
          reviewRequests: (pr.requested_reviewers || []).map((r: any) => r.login),
          additions: pr.additions,
          deletions: pr.deletions,
          files: files.map((f) => ({
            path: f.filename,
            additions: f.additions,
            deletions: f.deletions,
          })),
          ciStatus: status.state,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          mergedBy: pr.merged_by?.login || null,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return synced;
}

async function syncIssues(
  db: Database,
  octokit: Octokit,
  username: string
): Promise<number> {
  const { data: searchResult } = await octokit.search.issuesAndPullRequests({
    q: `is:issue is:open assignee:${username}`,
    per_page: 100,
  });

  let synced = 0;

  for (const item of searchResult.items) {
    const repoUrl = item.repository_url || "";
    const repoMatch = repoUrl.match(/repos\/(.+)$/);
    if (!repoMatch) continue;
    const repo = repoMatch[1];

    await db
      .insert(githubIssues)
      .values({
        id: item.node_id,
        repo,
        number: item.number,
        title: item.title,
        author: item.user?.login || "",
        state: item.state.toUpperCase(),
        assignees: (item.assignees || []).map((a: any) => a.login),
        labels: (item.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
        body: item.body || "",
        closedAt: item.closed_at ? new Date(item.closed_at) : null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: githubIssues.id,
        set: {
          state: item.state.toUpperCase(),
          assignees: (item.assignees || []).map((a: any) => a.login),
          labels: (item.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
          body: item.body || "",
          closedAt: item.closed_at ? new Date(item.closed_at) : null,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return synced;
}
```

- [ ] **Step 2: Write the test — tests/services/sync-github.test.ts**

```ts
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
```

- [ ] **Step 3: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/sync-github.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/sync-github.ts tests/services/sync-github.test.ts
git commit -m "feat: add GitHub sync service for PRs and issues"
```

---

### Task 9: Todoist Sync Service

**Files:**
- Create: `src/services/sync-todoist.ts`
- Create: `tests/services/sync-todoist.test.ts`

- [ ] **Step 1: Create src/services/sync-todoist.ts**

```ts
import { TodoistApi } from "@doist/todoist-api-typescript";
import type { Database } from "../db/index.js";
import { todoistTasks } from "../db/schema/todoist.js";
import { getCredentials } from "./credentials.js";

export async function syncTodoist(db: Database): Promise<{ synced: number }> {
  const cred = await getCredentials(db, "todoist");
  if (!cred) throw new Error("Todoist not connected");

  const api = new TodoistApi(cred.accessToken);

  // Fetch projects for name resolution
  const projectsResponse = await api.getProjects();
  const projectMap = new Map(projectsResponse.results.map((p) => [p.id, p.name]));

  // Fetch active tasks
  const tasksResponse = await api.getTasks();
  const tasks = tasksResponse.results;

  let synced = 0;

  for (const task of tasks) {
    const dueDate = task.due?.datetime
      ? new Date(task.due.datetime)
      : task.due?.date
        ? new Date(task.due.date)
        : null;

    await db
      .insert(todoistTasks)
      .values({
        id: task.id,
        content: task.content,
        description: task.description || "",
        projectId: task.projectId,
        projectName: projectMap.get(task.projectId) || "Unknown",
        priority: task.priority,
        dueDate,
        labels: task.labels,
        isCompleted: task.isCompleted,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: todoistTasks.id,
        set: {
          content: task.content,
          description: task.description || "",
          projectName: projectMap.get(task.projectId) || "Unknown",
          priority: task.priority,
          dueDate,
          labels: task.labels,
          isCompleted: task.isCompleted,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return { synced };
}
```

- [ ] **Step 2: Write the test — tests/services/sync-todoist.test.ts**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { syncTodoist } from "../../src/services/sync-todoist.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { oauthCredentials } from "../../src/db/schema/settings.js";

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("syncTodoist", () => {
  it("fetches tasks and stores them with project names", async () => {
    await testDb.insert(oauthCredentials).values({
      service: "todoist",
      accessToken: "td-test-token",
      refreshToken: "td-test-refresh",
    });

    const result = await syncTodoist(testDb as any);

    expect(result.synced).toBe(2);

    const stored = await testDb.select().from(todoistTasks);
    expect(stored).toHaveLength(2);

    const task1 = stored.find((t) => t.id === "td_api_001");
    expect(task1).toBeDefined();
    expect(task1!.content).toBe("Review Eight Arms PR");
    expect(task1!.projectName).toBe("Work");
    expect(task1!.labels).toEqual(["code-review"]);
    expect(task1!.dueDate).toBeDefined();

    const task2 = stored.find((t) => t.id === "td_api_002");
    expect(task2).toBeDefined();
    expect(task2!.projectName).toBe("Personal");
    expect(task2!.dueDate).toBeNull();
  });

  it("throws when Todoist is not connected", async () => {
    await expect(syncTodoist(testDb as any)).rejects.toThrow("Todoist not connected");
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/sync-todoist.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/sync-todoist.ts tests/services/sync-todoist.test.ts
git commit -m "feat: add Todoist sync service with project name resolution"
```

---

### Task 10: Sync Runner + Trigger Endpoint

**Files:**
- Create: `src/services/sync-runner.ts`
- Create: `src/routes/sync.ts`
- Modify: `src/server.ts`
- Create: `tests/routes/sync.test.ts`

- [ ] **Step 1: Create src/services/sync-runner.ts**

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { syncConfig } from "../db/schema/settings.js";
import { syncGmail } from "./sync-gmail.js";
import { syncGithub } from "./sync-github.js";
import { syncTodoist } from "./sync-todoist.js";
import type { ServiceName } from "./oauth-providers.js";

export interface SyncResult {
  service: ServiceName;
  success: boolean;
  detail: Record<string, number> | null;
  error: string | null;
}

export async function runSync(
  db: Database,
  services?: ServiceName[]
): Promise<SyncResult[]> {
  const toSync = services || (["gmail", "github", "todoist"] as ServiceName[]);
  const results: SyncResult[] = [];

  for (const service of toSync) {
    try {
      let detail: Record<string, number>;

      switch (service) {
        case "gmail":
          detail = await syncGmail(db);
          break;
        case "github":
          detail = await syncGithub(db);
          break;
        case "todoist":
          detail = await syncTodoist(db);
          break;
      }

      // Update last sync time
      await db
        .insert(syncConfig)
        .values({ service, lastSyncAt: new Date() })
        .onConflictDoUpdate({
          target: syncConfig.service,
          set: { lastSyncAt: new Date() },
        });

      results.push({ service, success: true, detail, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ service, success: false, detail: null, error: message });
    }
  }

  return results;
}
```

- [ ] **Step 2: Create src/routes/sync.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { runSync } from "../services/sync-runner.js";
import type { ServiceName } from "../services/oauth-providers.js";

const sync = new Hono();

sync.post("/trigger", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const services = body.services as ServiceName[] | undefined;

  const results = await runSync(db, services);
  return c.json({ results });
});

export { sync };
```

- [ ] **Step 3: Modify src/server.ts to mount the sync routes**

Update `src/server.ts`:

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { settings } from "./routes/settings.js";
import { sync } from "./routes/sync.js";

export const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/settings", settings);
app.route("/api/sync", sync);

const port = parseInt(process.env.PORT || "3000", 10);

if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
}
```

- [ ] **Step 4: Write the test — tests/routes/sync.test.ts**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { app } from "../../src/server.js";
import { testDb } from "../setup.js";
import { mockServer } from "../mocks/server.js";
import { oauthCredentials, syncConfig } from "../../src/db/schema/settings.js";
import { emails } from "../../src/db/schema/emails.js";

// Mock the db module to use testDb
vi.mock("../../src/db/index.js", () => ({
  db: (async () => {
    const { testDb } = await import("../setup.js");
    return testDb;
  })(),
}));

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
```

- [ ] **Step 5: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/routes/sync.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/sync-runner.ts src/routes/sync.ts src/server.ts tests/routes/sync.test.ts
git commit -m "feat: add sync runner and trigger endpoint"
```

---

### Task 11: In-Process Cron Scheduler

**Files:**
- Create: `src/cron.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create src/cron.ts**

```ts
import cron from "node-cron";
import { db } from "./db/index.js";
import { runSync } from "./services/sync-runner.js";

let task: cron.ScheduledTask | null = null;

export function startCron(intervalMinutes: number = 5): void {
  if (task) {
    task.stop();
  }

  const cronExpr = `*/${intervalMinutes} * * * *`;
  console.log(`Starting sync cron: every ${intervalMinutes} minutes (${cronExpr})`);

  task = cron.schedule(cronExpr, async () => {
    console.log(`[cron] Running sync at ${new Date().toISOString()}`);
    try {
      const results = await runSync(db);
      for (const r of results) {
        if (r.success) {
          console.log(`[cron] ${r.service}: synced (${JSON.stringify(r.detail)})`);
        } else {
          console.error(`[cron] ${r.service}: failed - ${r.error}`);
        }
      }
    } catch (err) {
      console.error("[cron] Sync failed:", err);
    }
  });
}

export function stopCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
```

- [ ] **Step 2: Modify src/server.ts to start cron on boot**

Update `src/server.ts`:

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { settings } from "./routes/settings.js";
import { sync } from "./routes/sync.js";
import { startCron } from "./cron.js";

export const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/settings", settings);
app.route("/api/sync", sync);

const port = parseInt(process.env.PORT || "3000", 10);

if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
  startCron();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cron.ts src/server.ts
git commit -m "feat: add in-process cron scheduler for periodic sync"
```

---

### Task 12: Add OAuth Env Vars to Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update docker-compose.yml to include OAuth env vars**

Add the OAuth environment variables to the app service. These will be empty by default — the user fills them in when they set up OAuth apps.

```yaml
services:
  app:
    build:
      context: .
      target: dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      DATABASE_URL: postgres://eight_arms:eight_arms@postgres:5432/eight_arms
      ENCRYPTION_KEY: dev-encryption-key-change-in-prod
      NODE_ENV: development
      OAUTH_REDIRECT_BASE: http://localhost:3000
      GMAIL_CLIENT_ID: ${GMAIL_CLIENT_ID:-}
      GMAIL_CLIENT_SECRET: ${GMAIL_CLIENT_SECRET:-}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:-}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:-}
      TODOIST_CLIENT_ID: ${TODOIST_CLIENT_ID:-}
      TODOIST_CLIENT_SECRET: ${TODOIST_CLIENT_SECRET:-}
    depends_on:
      postgres:
        condition: service_healthy
    stdin_open: true
    tty: true

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: eight_arms
      POSTGRES_PASSWORD: eight_arms
      POSTGRES_DB: eight_arms
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U eight_arms"]
      interval: 2s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Create .env.example**

```
# OAuth credentials — fill these in after creating OAuth apps
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add OAuth env vars to Docker Compose with .env.example"
```

---

### Task 13: Run Full Test Suite

**Files:** None — verification task.

- [ ] **Step 1: Run all tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test
```

Expected: All tests pass (16 existing + new tests from this plan).

- [ ] **Step 2: Verify the server starts with new routes**

```bash
docker compose up --build -d
docker compose exec app curl -s http://localhost:3000/api/health
docker compose exec app curl -s http://localhost:3000/api/settings
```

Expected: Health returns `{"status":"ok"}`, settings returns `{"services":{"gmail":false,"github":false,"todoist":false}}`.

No commit needed.
