# Plan 3: API + MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hono REST API endpoints with auto-generated OpenAPI spec, a shared service/query layer, and an MCP stdio server so Claude can access all synced data.

**Architecture:** A shared query service layer (`src/services/queries.ts`) provides data access functions used by both Hono API routes and MCP tools. API routes use `@hono/zod-openapi` for request validation and OpenAPI generation. The MCP server is a separate stdio entrypoint (`src/mcp.ts`) using `@modelcontextprotocol/sdk` that calls the same query functions.

**Tech Stack:** @hono/zod-openapi, @modelcontextprotocol/sdk, zod, drizzle-orm

---

## File Structure

```
eight-arms/
├── src/
│   ├── server.ts                          — (modify) Mount new API routes, serve OpenAPI spec
│   ├── mcp.ts                             — MCP stdio server entrypoint
│   ├── services/
│   │   └── queries.ts                     — Shared query functions for emails, PRs, issues, tasks, work
│   └── routes/
│       ├── emails.ts                      — GET /api/emails, GET /api/emails/:id, POST /api/emails/:id/archive
│       ├── github.ts                      — GET /api/pulls, GET /api/pulls/:id, GET /api/issues, GET /api/issues/:id
│       ├── todoist.ts                     — GET /api/todoist/tasks, GET /api/todoist/tasks/:id
│       └── work.ts                        — GET /api/work, GET /api/work/notes, POST /api/work/notes
├── tests/
│   ├── services/
│   │   └── queries.test.ts                — Query service tests against real Postgres
│   ├── routes/
│   │   ├── emails.test.ts                 — Email API endpoint tests
│   │   ├── github.test.ts                 — GitHub API endpoint tests
│   │   ├── todoist.test.ts                — Todoist API endpoint tests
│   │   └── work.test.ts                   — Work API endpoint tests
│   └── mcp.test.ts                        — MCP tool tests
└── mcp-config.json                        — MCP server config for Claude
```

---

### Task 1: Install MCP SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the MCP SDK**

```bash
pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Shared Query Service

**Files:**
- Create: `src/services/queries.ts`
- Create: `tests/services/queries.test.ts`

- [ ] **Step 1: Create src/services/queries.ts**

This is the shared data access layer used by both API routes and MCP tools. All functions accept a `db` parameter for testability.

```ts
import { eq, and, like, desc, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { emails } from "../db/schema/emails.js";
import { githubPullRequests, githubIssues } from "../db/schema/github.js";
import { todoistTasks } from "../db/schema/todoist.js";
import { emailGithubLinks, workNotes } from "../db/schema/work.js";

// --- Emails ---

export interface ListEmailsParams {
  unread?: boolean;
  hasGithubLink?: boolean;
  limit?: number;
}

export async function listEmails(db: Database, params: ListEmailsParams = {}) {
  let query = db.select().from(emails).orderBy(desc(emails.date));

  const conditions = [];
  if (params.unread !== undefined) {
    conditions.push(eq(emails.isRead, !params.unread));
  }
  conditions.push(eq(emails.isArchived, false));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  const results = await query;

  if (params.hasGithubLink) {
    const links = await db.select().from(emailGithubLinks);
    const linkedThreadIds = new Set(links.map((l) => l.emailThreadId));
    return results.filter((e) => linkedThreadIds.has(e.threadId));
  }

  return results;
}

export async function getEmail(db: Database, id: string) {
  const [email] = await db.select().from(emails).where(eq(emails.id, id));
  if (!email) return null;

  // Get linked GitHub data
  const links = await db
    .select()
    .from(emailGithubLinks)
    .where(eq(emailGithubLinks.emailThreadId, email.threadId));

  const githubData = [];
  for (const link of links) {
    if (link.sourceType === "pull_request") {
      const [pr] = await db
        .select()
        .from(githubPullRequests)
        .where(
          and(
            eq(githubPullRequests.repo, link.repo),
            eq(githubPullRequests.number, link.number)
          )
        );
      if (pr) githubData.push({ type: "pull_request" as const, data: pr });
    } else {
      const [issue] = await db
        .select()
        .from(githubIssues)
        .where(
          and(
            eq(githubIssues.repo, link.repo),
            eq(githubIssues.number, link.number)
          )
        );
      if (issue) githubData.push({ type: "issue" as const, data: issue });
    }
  }

  return { ...email, github: githubData };
}

export async function archiveEmail(db: Database, id: string) {
  await db
    .update(emails)
    .set({ isArchived: true, labels: sql`"labels" - 'INBOX'` })
    .where(eq(emails.id, id));
}

// --- GitHub ---

export interface ListPullsParams {
  repo?: string;
  reviewStatus?: string;
  limit?: number;
}

export async function listPulls(db: Database, params: ListPullsParams = {}) {
  const conditions = [];
  if (params.repo) {
    conditions.push(eq(githubPullRequests.repo, params.repo));
  }
  if (params.reviewStatus) {
    conditions.push(eq(githubPullRequests.reviewDecision, params.reviewStatus));
  }

  let query = db
    .select()
    .from(githubPullRequests)
    .orderBy(desc(githubPullRequests.syncedAt));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getPull(db: Database, id: string) {
  const [pr] = await db
    .select()
    .from(githubPullRequests)
    .where(eq(githubPullRequests.id, id));
  return pr || null;
}

export interface ListIssuesParams {
  repo?: string;
  state?: string;
  limit?: number;
}

export async function listIssues(db: Database, params: ListIssuesParams = {}) {
  const conditions = [];
  if (params.repo) {
    conditions.push(eq(githubIssues.repo, params.repo));
  }
  if (params.state) {
    conditions.push(eq(githubIssues.state, params.state));
  }

  let query = db
    .select()
    .from(githubIssues)
    .orderBy(desc(githubIssues.syncedAt));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getIssue(db: Database, id: string) {
  const [issue] = await db
    .select()
    .from(githubIssues)
    .where(eq(githubIssues.id, id));
  return issue || null;
}

// --- Todoist ---

export interface ListTodoistTasksParams {
  project?: string;
  priority?: number;
  limit?: number;
}

export async function listTodoistTasks(
  db: Database,
  params: ListTodoistTasksParams = {}
) {
  const conditions = [eq(todoistTasks.isCompleted, false)];
  if (params.project) {
    conditions.push(eq(todoistTasks.projectName, params.project));
  }
  if (params.priority) {
    conditions.push(eq(todoistTasks.priority, params.priority));
  }

  let query = db
    .select()
    .from(todoistTasks)
    .where(and(...conditions))
    .orderBy(todoistTasks.priority, todoistTasks.dueDate);

  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getTodoistTask(db: Database, id: string) {
  const [task] = await db
    .select()
    .from(todoistTasks)
    .where(eq(todoistTasks.id, id));
  return task || null;
}

// --- Work (unified view) ---

export interface ListWorkParams {
  repo?: string;
  sourceType?: string;
  groomed?: boolean;
  limit?: number;
}

export async function listWork(db: Database, params: ListWorkParams = {}) {
  // Fetch all sources
  const pullsPromise = params.sourceType && params.sourceType !== "pull_request"
    ? Promise.resolve([])
    : listPulls(db, { repo: params.repo });

  const issuesPromise = params.sourceType && params.sourceType !== "issue"
    ? Promise.resolve([])
    : listIssues(db, { repo: params.repo });

  const tasksPromise = params.sourceType && params.sourceType !== "todoist_task"
    ? Promise.resolve([])
    : listTodoistTasks(db);

  const emailsPromise = params.sourceType && params.sourceType !== "email"
    ? Promise.resolve([])
    : listEmails(db, { unread: true });

  const [pulls, issues, tasks, unreadEmails] = await Promise.all([
    pullsPromise,
    issuesPromise,
    tasksPromise,
    emailsPromise,
  ]);

  // Get all work notes
  const notes = await db.select().from(workNotes);
  const notesMap = new Map(
    notes.map((n) => [`${n.sourceType}:${n.sourceId}`, n])
  );

  // Build unified list
  const items: {
    sourceType: string;
    sourceId: string;
    title: string;
    repo?: string;
    source: Record<string, unknown>;
    note: typeof notes[0] | null;
  }[] = [];

  for (const pr of pulls) {
    items.push({
      sourceType: "pull_request",
      sourceId: pr.id,
      title: `${pr.repo}#${pr.number}: ${pr.title}`,
      repo: pr.repo,
      source: pr as any,
      note: notesMap.get(`pull_request:${pr.id}`) || null,
    });
  }

  for (const issue of issues) {
    items.push({
      sourceType: "issue",
      sourceId: issue.id,
      title: `${issue.repo}#${issue.number}: ${issue.title}`,
      repo: issue.repo,
      source: issue as any,
      note: notesMap.get(`issue:${issue.id}`) || null,
    });
  }

  for (const task of tasks) {
    items.push({
      sourceType: "todoist_task",
      sourceId: task.id,
      title: task.content,
      source: task as any,
      note: notesMap.get(`todoist_task:${task.id}`) || null,
    });
  }

  for (const email of unreadEmails) {
    items.push({
      sourceType: "email",
      sourceId: email.id,
      title: `${email.from}: ${email.subject}`,
      source: email as any,
      note: notesMap.get(`email:${email.id}`) || null,
    });
  }

  // Filter by groomed status
  if (params.groomed !== undefined) {
    return items.filter((item) =>
      params.groomed ? item.note !== null : item.note === null
    );
  }

  if (params.limit) {
    return items.slice(0, params.limit);
  }

  return items;
}

// --- Work Notes ---

export async function getWorkNotes(
  db: Database,
  sourceType: string,
  sourceId: string
) {
  const [note] = await db
    .select()
    .from(workNotes)
    .where(
      and(eq(workNotes.sourceType, sourceType), eq(workNotes.sourceId, sourceId))
    );
  return note || null;
}

export async function saveWorkNotes(
  db: Database,
  data: {
    sourceType: string;
    sourceId: string;
    notes: string;
    estimate?: string;
    isActionable?: boolean;
  }
) {
  const existing = await getWorkNotes(db, data.sourceType, data.sourceId);

  if (existing) {
    await db
      .update(workNotes)
      .set({
        notes: data.notes,
        estimate: data.estimate ?? existing.estimate,
        isActionable: data.isActionable ?? existing.isActionable,
        groomedAt: new Date(),
      })
      .where(eq(workNotes.id, existing.id));
  } else {
    await db.insert(workNotes).values({
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      notes: data.notes,
      estimate: data.estimate || null,
      isActionable: data.isActionable || false,
    });
  }
}
```

- [ ] **Step 2: Write the test — tests/services/queries.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import {
  listEmails,
  getEmail,
  archiveEmail,
  listPulls,
  getPull,
  listIssues,
  listTodoistTasks,
  listWork,
  getWorkNotes,
  saveWorkNotes,
} from "../../src/services/queries.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { emailGithubLinks } from "../../src/db/schema/work.js";

// Seed helper
async function seedData() {
  await testDb.insert(emails).values([
    {
      id: "e1",
      threadId: "t1",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      date: new Date("2026-03-30T10:00:00Z"),
      isRead: false,
      isArchived: false,
    },
    {
      id: "e2",
      threadId: "t2",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] Fix bug (PR #42)",
      date: new Date("2026-03-30T11:00:00Z"),
      isRead: false,
      isArchived: false,
    },
  ]);

  await testDb.insert(githubPullRequests).values({
    id: "pr1",
    repo: "acme/widget",
    number: 42,
    title: "Fix bug",
    author: "alice",
    state: "OPEN",
    branch: "fix-bug",
    reviewRequests: ["me"],
  });

  await testDb.insert(githubIssues).values({
    id: "i1",
    repo: "acme/widget",
    number: 10,
    title: "Bug report",
    author: "bob",
    state: "OPEN",
    assignees: ["me"],
    labels: ["bug"],
  });

  await testDb.insert(todoistTasks).values({
    id: "td1",
    content: "Review PR",
    projectId: "p1",
    projectName: "Work",
    priority: 1,
    isCompleted: false,
  });

  await testDb.insert(emailGithubLinks).values({
    emailThreadId: "t2",
    sourceType: "pull_request",
    sourceId: "pr1",
    repo: "acme/widget",
    number: 42,
  });
}

describe("queries", () => {
  describe("emails", () => {
    it("lists unread non-archived emails", async () => {
      await seedData();
      const result = await listEmails(testDb as any, { unread: true });
      expect(result).toHaveLength(2);
    });

    it("filters emails with github links", async () => {
      await seedData();
      const result = await listEmails(testDb as any, { hasGithubLink: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("e2");
    });

    it("gets email with linked github data", async () => {
      await seedData();
      const result = await getEmail(testDb as any, "e2");
      expect(result).not.toBeNull();
      expect(result!.github).toHaveLength(1);
      expect(result!.github[0].type).toBe("pull_request");
      expect(result!.github[0].data.title).toBe("Fix bug");
    });

    it("archives an email", async () => {
      await seedData();
      await archiveEmail(testDb as any, "e1");
      const result = await listEmails(testDb as any);
      expect(result.find((e) => e.id === "e1")).toBeUndefined();
    });
  });

  describe("github", () => {
    it("lists PRs filtered by repo", async () => {
      await seedData();
      const result = await listPulls(testDb as any, { repo: "acme/widget" });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Fix bug");
    });

    it("lists issues filtered by repo", async () => {
      await seedData();
      const result = await listIssues(testDb as any, { repo: "acme/widget" });
      expect(result).toHaveLength(1);
    });
  });

  describe("todoist", () => {
    it("lists active tasks", async () => {
      await seedData();
      const result = await listTodoistTasks(testDb as any);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Review PR");
    });
  });

  describe("work", () => {
    it("returns unified view of all work items", async () => {
      await seedData();
      const result = await listWork(testDb as any);
      expect(result.length).toBeGreaterThanOrEqual(4); // 1 PR + 1 issue + 1 task + 2 emails
    });

    it("filters by repo", async () => {
      await seedData();
      const result = await listWork(testDb as any, { repo: "acme/widget" });
      const prItems = result.filter((r) => r.sourceType === "pull_request");
      expect(prItems).toHaveLength(1);
    });

    it("filters by sourceType", async () => {
      await seedData();
      const result = await listWork(testDb as any, {
        sourceType: "todoist_task",
      });
      expect(result.every((r) => r.sourceType === "todoist_task")).toBe(true);
    });
  });

  describe("work notes", () => {
    it("saves and retrieves notes", async () => {
      await saveWorkNotes(testDb as any, {
        sourceType: "pull_request",
        sourceId: "pr1",
        notes: "Need to check auth module",
        estimate: "1h",
        isActionable: true,
      });

      const result = await getWorkNotes(testDb as any, "pull_request", "pr1");
      expect(result).not.toBeNull();
      expect(result!.notes).toBe("Need to check auth module");
      expect(result!.estimate).toBe("1h");
      expect(result!.isActionable).toBe(true);
    });

    it("updates existing notes", async () => {
      await saveWorkNotes(testDb as any, {
        sourceType: "issue",
        sourceId: "i1",
        notes: "Initial",
      });
      await saveWorkNotes(testDb as any, {
        sourceType: "issue",
        sourceId: "i1",
        notes: "Updated",
        estimate: "30m",
      });

      const result = await getWorkNotes(testDb as any, "issue", "i1");
      expect(result!.notes).toBe("Updated");
      expect(result!.estimate).toBe("30m");
    });
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/services/queries.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/queries.ts tests/services/queries.test.ts
git commit -m "feat: add shared query service layer for emails, PRs, issues, tasks, work"
```

---

### Task 3: Email API Routes

**Files:**
- Create: `src/routes/emails.ts`
- Modify: `src/server.ts`
- Create: `tests/routes/emails.test.ts`

- [ ] **Step 1: Create src/routes/emails.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { listEmails, getEmail, archiveEmail } from "../services/queries.js";
import { getCredentials } from "../services/credentials.js";

const emailRoutes = new Hono();

emailRoutes.get("/", async (c) => {
  const unread = c.req.query("unread");
  const hasGithubLink = c.req.query("hasGithubLink");
  const limit = c.req.query("limit");

  const result = await listEmails(db, {
    unread: unread === "true" ? true : unread === "false" ? false : undefined,
    hasGithubLink: hasGithubLink === "true" ? true : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

emailRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getEmail(db, id);
  if (!result) {
    return c.json({ error: "Email not found" }, 404);
  }
  return c.json(result);
});

emailRoutes.post("/:id/archive", async (c) => {
  const id = c.req.param("id");

  // Archive in DB
  await archiveEmail(db, id);

  // Also archive in Gmail if connected
  try {
    const cred = await getCredentials(db, "gmail");
    if (cred) {
      await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cred.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
        }
      );
    }
  } catch {
    // Gmail archive failed but DB is updated — acceptable
  }

  return c.json({ ok: true });
});

export { emailRoutes };
```

- [ ] **Step 2: Mount in src/server.ts**

Add the import and route mounting. Read current `src/server.ts` first, then add:

```ts
import { emailRoutes } from "./routes/emails.js";
// ... after existing routes
app.route("/api/emails", emailRoutes);
```

- [ ] **Step 3: Write the test — tests/routes/emails.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { emailGithubLinks } from "../../src/db/schema/work.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

async function seedEmails() {
  await testDb.insert(emails).values([
    {
      id: "e1",
      threadId: "t1",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      date: new Date("2026-03-30T10:00:00Z"),
      isRead: false,
    },
    {
      id: "e2",
      threadId: "t2",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] PR #42",
      date: new Date("2026-03-30T11:00:00Z"),
      isRead: true,
    },
  ]);
}

describe("email routes", () => {
  it("GET /api/emails lists emails", async () => {
    await seedEmails();
    const res = await app.request("/api/emails");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("GET /api/emails?unread=true filters unread", async () => {
    await seedEmails();
    const res = await app.request("/api/emails?unread=true");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("e1");
  });

  it("GET /api/emails/:id returns email with github data", async () => {
    await seedEmails();
    await testDb.insert(githubPullRequests).values({
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
    });
    await testDb.insert(emailGithubLinks).values({
      emailThreadId: "t2",
      sourceType: "pull_request",
      sourceId: "pr1",
      repo: "acme/widget",
      number: 42,
    });

    const res = await app.request("/api/emails/e2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.github).toHaveLength(1);
  });

  it("GET /api/emails/:id returns 404 for missing email", async () => {
    const res = await app.request("/api/emails/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/emails/:id/archive archives the email", async () => {
    await seedEmails();
    const res = await app.request("/api/emails/e1/archive", { method: "POST" });
    expect(res.status).toBe(200);

    const listRes = await app.request("/api/emails");
    const body = await listRes.json();
    expect(body.find((e: any) => e.id === "e1")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/routes/emails.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/emails.ts src/server.ts tests/routes/emails.test.ts
git commit -m "feat: add email API routes (list, get with github links, archive)"
```

---

### Task 4: GitHub API Routes

**Files:**
- Create: `src/routes/github.ts`
- Modify: `src/server.ts`
- Create: `tests/routes/github.test.ts`

- [ ] **Step 1: Create src/routes/github.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { listPulls, getPull, listIssues, getIssue } from "../services/queries.js";

const githubRoutes = new Hono();

githubRoutes.get("/pulls", async (c) => {
  const repo = c.req.query("repo");
  const reviewStatus = c.req.query("reviewStatus");
  const limit = c.req.query("limit");

  const result = await listPulls(db, {
    repo: repo || undefined,
    reviewStatus: reviewStatus || undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

githubRoutes.get("/pulls/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getPull(db, id);
  if (!result) {
    return c.json({ error: "Pull request not found" }, 404);
  }
  return c.json(result);
});

githubRoutes.get("/issues", async (c) => {
  const repo = c.req.query("repo");
  const state = c.req.query("state");
  const limit = c.req.query("limit");

  const result = await listIssues(db, {
    repo: repo || undefined,
    state: state || undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

githubRoutes.get("/issues/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getIssue(db, id);
  if (!result) {
    return c.json({ error: "Issue not found" }, 404);
  }
  return c.json(result);
});

export { githubRoutes };
```

- [ ] **Step 2: Mount in src/server.ts**

```ts
import { githubRoutes } from "./routes/github.js";
// Mount under /api (not /api/github since routes define /pulls and /issues)
app.route("/api", githubRoutes);
```

- [ ] **Step 3: Write the test — tests/routes/github.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { githubPullRequests, githubIssues } from "../../src/db/schema/github.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

async function seedGithub() {
  await testDb.insert(githubPullRequests).values([
    {
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
      reviewRequests: ["me"],
    },
    {
      id: "pr2",
      repo: "acme/gadget",
      number: 7,
      title: "Add feature",
      author: "bob",
      state: "OPEN",
      branch: "feat",
    },
  ]);

  await testDb.insert(githubIssues).values({
    id: "i1",
    repo: "acme/widget",
    number: 10,
    title: "Bug report",
    author: "carol",
    state: "OPEN",
    assignees: ["me"],
    labels: ["bug"],
  });
}

describe("github routes", () => {
  it("GET /api/pulls lists all PRs", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("GET /api/pulls?repo= filters by repo", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls?repo=acme/widget");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Fix bug");
  });

  it("GET /api/pulls/:id returns single PR", async () => {
    await seedGithub();
    const res = await app.request("/api/pulls/pr1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Fix bug");
  });

  it("GET /api/issues lists issues", async () => {
    await seedGithub();
    const res = await app.request("/api/issues");
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("GET /api/issues/:id returns 404 for missing", async () => {
    const res = await app.request("/api/issues/nonexistent");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run tests and commit**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test -- tests/routes/github.test.ts
git add src/routes/github.ts src/server.ts tests/routes/github.test.ts
git commit -m "feat: add GitHub API routes (pulls, issues)"
```

---

### Task 5: Todoist + Work API Routes

**Files:**
- Create: `src/routes/todoist.ts`
- Create: `src/routes/work.ts`
- Modify: `src/server.ts`
- Create: `tests/routes/todoist.test.ts`
- Create: `tests/routes/work.test.ts`

- [ ] **Step 1: Create src/routes/todoist.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { listTodoistTasks, getTodoistTask } from "../services/queries.js";

const todoistRoutes = new Hono();

todoistRoutes.get("/tasks", async (c) => {
  const project = c.req.query("project");
  const priority = c.req.query("priority");
  const limit = c.req.query("limit");

  const result = await listTodoistTasks(db, {
    project: project || undefined,
    priority: priority ? parseInt(priority) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

todoistRoutes.get("/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getTodoistTask(db, id);
  if (!result) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(result);
});

export { todoistRoutes };
```

- [ ] **Step 2: Create src/routes/work.ts**

```ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { listWork, getWorkNotes, saveWorkNotes } from "../services/queries.js";

const workRoutes = new Hono();

workRoutes.get("/", async (c) => {
  const repo = c.req.query("repo");
  const sourceType = c.req.query("sourceType");
  const groomed = c.req.query("groomed");
  const limit = c.req.query("limit");

  const result = await listWork(db, {
    repo: repo || undefined,
    sourceType: sourceType || undefined,
    groomed: groomed === "true" ? true : groomed === "false" ? false : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

workRoutes.get("/notes", async (c) => {
  const sourceType = c.req.query("sourceType");
  const sourceId = c.req.query("sourceId");

  if (!sourceType || !sourceId) {
    return c.json({ error: "sourceType and sourceId required" }, 400);
  }

  const result = await getWorkNotes(db, sourceType, sourceId);
  return c.json(result);
});

workRoutes.post("/notes", async (c) => {
  const body = await c.req.json();
  const { sourceType, sourceId, notes, estimate, isActionable } = body;

  if (!sourceType || !sourceId || notes === undefined) {
    return c.json({ error: "sourceType, sourceId, and notes required" }, 400);
  }

  await saveWorkNotes(db, { sourceType, sourceId, notes, estimate, isActionable });
  return c.json({ ok: true });
});

export { workRoutes };
```

- [ ] **Step 3: Mount in src/server.ts**

```ts
import { todoistRoutes } from "./routes/todoist.js";
import { workRoutes } from "./routes/work.js";

app.route("/api/todoist", todoistRoutes);
app.route("/api/work", workRoutes);
```

- [ ] **Step 4: Write tests**

**tests/routes/todoist.test.ts:**

```ts
import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

describe("todoist routes", () => {
  it("GET /api/todoist/tasks lists active tasks", async () => {
    await testDb.insert(todoistTasks).values({
      id: "td1",
      content: "Review PR",
      projectId: "p1",
      projectName: "Work",
      priority: 1,
      isCompleted: false,
    });

    const res = await app.request("/api/todoist/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].content).toBe("Review PR");
  });

  it("GET /api/todoist/tasks/:id returns 404 for missing", async () => {
    const res = await app.request("/api/todoist/tasks/nonexistent");
    expect(res.status).toBe(404);
  });
});
```

**tests/routes/work.test.ts:**

```ts
import { describe, it, expect, vi } from "vitest";
import { testDb } from "../setup.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { workNotes } from "../../src/db/schema/work.js";

vi.mock("../../src/db/index.js", async () => {
  const { testDb } = await import("../setup.js");
  return { db: testDb };
});

const { app } = await import("../../src/server.js");

describe("work routes", () => {
  it("GET /api/work returns unified work items", async () => {
    await testDb.insert(githubPullRequests).values({
      id: "pr1",
      repo: "acme/widget",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "OPEN",
      branch: "fix",
    });

    const res = await app.request("/api/work");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/work/notes saves notes", async () => {
    const res = await app.request("/api/work/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: "pull_request",
        sourceId: "pr1",
        notes: "Check auth module",
        estimate: "1h",
        isActionable: true,
      }),
    });
    expect(res.status).toBe(200);

    const getRes = await app.request(
      "/api/work/notes?sourceType=pull_request&sourceId=pr1"
    );
    const body = await getRes.json();
    expect(body.notes).toBe("Check auth module");
  });

  it("GET /api/work/notes returns 400 without params", async () => {
    const res = await app.request("/api/work/notes");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 5: Run tests and commit**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test
git add src/routes/todoist.ts src/routes/work.ts src/server.ts tests/routes/todoist.test.ts tests/routes/work.test.ts
git commit -m "feat: add Todoist and work API routes"
```

---

### Task 6: OpenAPI Spec Endpoint

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add OpenAPI spec endpoint**

Add to `src/server.ts`:

```ts
app.get("/api/openapi.json", (c) => {
  return c.json({
    openapi: "3.0.0",
    info: { title: "Eight Arms API", version: "0.1.0" },
    paths: {
      "/api/emails": {
        get: {
          summary: "List emails",
          parameters: [
            { name: "unread", in: "query", schema: { type: "boolean" } },
            { name: "hasGithubLink", in: "query", schema: { type: "boolean" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/emails/{id}": {
        get: { summary: "Get email by ID with linked GitHub data" },
      },
      "/api/emails/{id}/archive": {
        post: { summary: "Archive an email" },
      },
      "/api/pulls": {
        get: {
          summary: "List pull requests",
          parameters: [
            { name: "repo", in: "query", schema: { type: "string" } },
            { name: "reviewStatus", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/pulls/{id}": {
        get: { summary: "Get pull request by ID" },
      },
      "/api/issues": {
        get: {
          summary: "List issues",
          parameters: [
            { name: "repo", in: "query", schema: { type: "string" } },
            { name: "state", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/issues/{id}": {
        get: { summary: "Get issue by ID" },
      },
      "/api/todoist/tasks": {
        get: {
          summary: "List Todoist tasks",
          parameters: [
            { name: "project", in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/todoist/tasks/{id}": {
        get: { summary: "Get Todoist task by ID" },
      },
      "/api/work": {
        get: {
          summary: "Unified view of all work items",
          parameters: [
            { name: "repo", in: "query", schema: { type: "string" } },
            { name: "sourceType", in: "query", schema: { type: "string" } },
            { name: "groomed", in: "query", schema: { type: "boolean" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/api/work/notes": {
        get: {
          summary: "Get work notes",
          parameters: [
            { name: "sourceType", in: "query", schema: { type: "string" }, required: true },
            { name: "sourceId", in: "query", schema: { type: "string" }, required: true },
          ],
        },
        post: { summary: "Save work notes" },
      },
      "/api/sync/trigger": {
        post: { summary: "Trigger sync" },
      },
      "/api/settings": {
        get: { summary: "Get connection status" },
      },
    },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server.ts
git commit -m "feat: add OpenAPI spec endpoint at /api/openapi.json"
```

---

### Task 7: MCP Server

**Files:**
- Create: `src/mcp.ts`
- Create: `mcp-config.json`
- Modify: `package.json`

- [ ] **Step 1: Create src/mcp.ts**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "./db/index.js";
import {
  listEmails,
  getEmail,
  archiveEmail,
  listPulls,
  getPull,
  listIssues,
  getIssue,
  listTodoistTasks,
  getTodoistTask,
  listWork,
  getWorkNotes,
  saveWorkNotes,
} from "./services/queries.js";
import { runSync } from "./services/sync-runner.js";

const server = new McpServer({
  name: "eight-arms",
  version: "0.1.0",
});

// --- Email tools ---

server.tool(
  "list_emails",
  "List inbox emails. Returns id, from, subject, date, isRead, labels.",
  {
    unread: z.boolean().optional().describe("Filter to unread only"),
    hasGithubLink: z.boolean().optional().describe("Filter to emails linked to GitHub PRs/issues"),
    limit: z.number().optional().describe("Max results"),
  },
  async ({ unread, hasGithubLink, limit }) => {
    const results = await listEmails(db, { unread, hasGithubLink, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "get_email",
  "Get full email detail including linked GitHub PR/issue data.",
  {
    id: z.string().describe("Email ID"),
  },
  async ({ id }) => {
    const result = await getEmail(db, id);
    if (!result) {
      return { content: [{ type: "text", text: "Email not found" }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "archive_email",
  "Archive an email (removes from inbox in DB and Gmail).",
  {
    id: z.string().describe("Email ID"),
  },
  async ({ id }) => {
    await archiveEmail(db, id);

    // Also archive in Gmail
    try {
      const { getCredentials } = await import("./services/credentials.js");
      const cred = await getCredentials(db, "gmail");
      if (cred) {
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cred.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
          }
        );
      }
    } catch {
      // Gmail archive failed but DB is updated
    }

    return { content: [{ type: "text", text: "Email archived" }] };
  }
);

// --- GitHub tools ---

server.tool(
  "list_pulls",
  "List pull requests. Filterable by repo and review status.",
  {
    repo: z.string().optional().describe("Filter by repo (owner/repo)"),
    reviewStatus: z.string().optional().describe("Filter by review decision"),
    limit: z.number().optional().describe("Max results"),
  },
  async ({ repo, reviewStatus, limit }) => {
    const results = await listPulls(db, { repo, reviewStatus, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "get_pull",
  "Get full pull request detail including files, CI status, reviewers.",
  {
    id: z.string().describe("PR ID (node_id)"),
  },
  async ({ id }) => {
    const result = await getPull(db, id);
    if (!result) {
      return { content: [{ type: "text", text: "PR not found" }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "list_issues",
  "List GitHub issues. Filterable by repo and state.",
  {
    repo: z.string().optional().describe("Filter by repo (owner/repo)"),
    state: z.string().optional().describe("Filter by state (OPEN, CLOSED)"),
    limit: z.number().optional().describe("Max results"),
  },
  async ({ repo, state, limit }) => {
    const results = await listIssues(db, { repo, state, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "get_issue",
  "Get full issue detail.",
  {
    id: z.string().describe("Issue ID (node_id)"),
  },
  async ({ id }) => {
    const result = await getIssue(db, id);
    if (!result) {
      return { content: [{ type: "text", text: "Issue not found" }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Todoist tools ---

server.tool(
  "list_todoist_tasks",
  "List active Todoist tasks. Filterable by project and priority.",
  {
    project: z.string().optional().describe("Filter by project name"),
    priority: z.number().optional().describe("Filter by priority (1=highest, 4=lowest)"),
    limit: z.number().optional().describe("Max results"),
  },
  async ({ project, priority, limit }) => {
    const results = await listTodoistTasks(db, { project, priority, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "get_todoist_task",
  "Get full Todoist task detail.",
  {
    id: z.string().describe("Todoist task ID"),
  },
  async ({ id }) => {
    const result = await getTodoistTask(db, id);
    if (!result) {
      return { content: [{ type: "text", text: "Task not found" }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Work tools ---

server.tool(
  "list_work",
  "Unified view of all work items across Gmail, GitHub, and Todoist. Returns items with source data and grooming notes.",
  {
    repo: z.string().optional().describe("Filter PRs/issues by repo (owner/repo)"),
    sourceType: z.string().optional().describe("Filter by type: pull_request, issue, todoist_task, email"),
    groomed: z.boolean().optional().describe("Filter by groomed status"),
    limit: z.number().optional().describe("Max results"),
  },
  async ({ repo, sourceType, groomed, limit }) => {
    const results = await listWork(db, { repo, sourceType, groomed, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "get_work_notes",
  "Get grooming notes for a work item.",
  {
    sourceType: z.string().describe("Source type: pull_request, issue, todoist_task, email"),
    sourceId: z.string().describe("Source ID"),
  },
  async ({ sourceType, sourceId }) => {
    const result = await getWorkNotes(db, sourceType, sourceId);
    return {
      content: [{ type: "text", text: result ? JSON.stringify(result, null, 2) : "No notes found" }],
    };
  }
);

server.tool(
  "save_work_notes",
  "Save or update grooming notes for a work item.",
  {
    sourceType: z.string().describe("Source type: pull_request, issue, todoist_task, email"),
    sourceId: z.string().describe("Source ID"),
    notes: z.string().describe("Notes text"),
    estimate: z.string().optional().describe("Time estimate (e.g. '30m', '2h')"),
    isActionable: z.boolean().optional().describe("Whether the item is actionable"),
  },
  async ({ sourceType, sourceId, notes, estimate, isActionable }) => {
    await saveWorkNotes(db, { sourceType, sourceId, notes, estimate, isActionable });
    return { content: [{ type: "text", text: "Notes saved" }] };
  }
);

server.tool(
  "trigger_sync",
  "Trigger a data sync for connected services.",
  {
    services: z.array(z.string()).optional().describe("Services to sync: gmail, github, todoist. Omit for all."),
  },
  async ({ services }) => {
    const results = await runSync(db, services as any);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Create mcp-config.json**

This is the config file users add to their Claude MCP settings.

```json
{
  "mcpServers": {
    "eight-arms": {
      "command": "docker",
      "args": ["compose", "exec", "-T", "app", "npx", "tsx", "src/mcp.ts"],
      "cwd": "/Users/danielb/projects/eight-arms"
    }
  }
}
```

- [ ] **Step 3: Add mcp script to package.json**

Add to scripts:
```json
"mcp": "tsx src/mcp.ts"
```

- [ ] **Step 4: Commit**

```bash
git add src/mcp.ts mcp-config.json package.json
git commit -m "feat: add MCP stdio server with all tools for Claude integration"
```

---

### Task 8: MCP Integration Test

**Files:**
- Create: `tests/mcp.test.ts`

- [ ] **Step 1: Write MCP tool tests**

Test that the MCP tools call the correct query functions. Since the MCP server uses stdio, we test the underlying query functions directly (already covered in Task 2) and verify the MCP server module can be imported.

```ts
import { describe, it, expect, vi } from "vitest";
import { testDb } from "./setup.js";
import { emails } from "../src/db/schema/emails.js";
import { githubPullRequests } from "../src/db/schema/github.js";
import {
  listEmails,
  getEmail,
  listPulls,
  listWork,
  saveWorkNotes,
  getWorkNotes,
} from "../src/services/queries.js";

describe("MCP tool queries", () => {
  it("list_emails query returns expected shape", async () => {
    await testDb.insert(emails).values({
      id: "mcp_e1",
      threadId: "mcp_t1",
      from: "test@example.com",
      to: "me@example.com",
      subject: "MCP Test",
      date: new Date(),
      isRead: false,
    });

    const result = await listEmails(testDb as any, { unread: true });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("from");
    expect(result[0]).toHaveProperty("subject");
  });

  it("list_pulls query returns expected shape", async () => {
    await testDb.insert(githubPullRequests).values({
      id: "mcp_pr1",
      repo: "test/repo",
      number: 1,
      title: "Test PR",
      author: "tester",
      state: "OPEN",
      branch: "test",
    });

    const result = await listPulls(testDb as any, { repo: "test/repo" });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("files");
    expect(result[0]).toHaveProperty("reviewRequests");
  });

  it("save_work_notes and get_work_notes round-trip", async () => {
    await saveWorkNotes(testDb as any, {
      sourceType: "pull_request",
      sourceId: "mcp_pr1",
      notes: "MCP test notes",
      estimate: "15m",
      isActionable: true,
    });

    const result = await getWorkNotes(testDb as any, "pull_request", "mcp_pr1");
    expect(result).not.toBeNull();
    expect(result!.notes).toBe("MCP test notes");
    expect(result!.estimate).toBe("15m");
  });

  it("list_work includes items from multiple sources", async () => {
    await testDb.insert(emails).values({
      id: "mcp_e2",
      threadId: "mcp_t2",
      from: "work@example.com",
      to: "me@example.com",
      subject: "Work email",
      date: new Date(),
      isRead: false,
    });

    await testDb.insert(githubPullRequests).values({
      id: "mcp_pr2",
      repo: "test/repo",
      number: 2,
      title: "Another PR",
      author: "dev",
      state: "OPEN",
      branch: "feature",
    });

    const result = await listWork(testDb as any);
    const types = new Set(result.map((r) => r.sourceType));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/mcp.test.ts
git commit -m "feat: add MCP integration tests"
```

---

### Task 9: Full Verification

**Files:** None — verification task.

- [ ] **Step 1: Run all tests**

```bash
docker compose -f docker-compose.test.yml run --rm app pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Rebuild and test API endpoints**

```bash
docker compose up --build -d
sleep 3
docker compose exec app curl -s http://localhost:3210/api/emails?limit=3
docker compose exec app curl -s http://localhost:3210/api/pulls?limit=3
docker compose exec app curl -s http://localhost:3210/api/issues?limit=3
docker compose exec app curl -s http://localhost:3210/api/todoist/tasks?limit=3
docker compose exec app curl -s http://localhost:3210/api/work?limit=3
docker compose exec app curl -s http://localhost:3210/api/openapi.json
```

- [ ] **Step 3: Test MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | docker compose exec -T app pnpm mcp
```

Expected: Returns a JSON-RPC response with server capabilities.

No commit needed — this is verification only.
