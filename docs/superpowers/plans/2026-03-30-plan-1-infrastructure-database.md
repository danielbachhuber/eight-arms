# Plan 1: Infrastructure + Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get Docker Compose running with an app container (Node.js + Claude Code CLI) and Postgres container, with Drizzle ORM schema and migrations working, so Claude can be launched inside the container to implement the rest of the application.

**Architecture:** Docker Compose with two services: `app` (Node.js dev container with bind-mounted project directory) and `postgres`. The app container includes Claude Code CLI, Node.js, and git. Drizzle ORM defines the schema in TypeScript with Zod integration, and Drizzle Kit generates/runs SQL migrations. On startup, the app container runs pending migrations automatically.

**Tech Stack:** Docker, Docker Compose, Node.js 22, TypeScript, Drizzle ORM, Drizzle Kit, Zod, PostgreSQL 16, Vitest

---

## File Structure

```
eight-arms/
├── docker-compose.yml              — Defines app + postgres services
├── docker-compose.test.yml         — Test variant with ephemeral postgres
├── Dockerfile                      — Multi-stage: dev (with Claude) and prod
├── .dockerignore                   — Exclude node_modules, .git, etc.
├── package.json                    — Project dependencies and scripts
├── tsconfig.json                   — TypeScript configuration
├── drizzle.config.ts               — Drizzle Kit configuration
├── src/
│   ├── db/
│   │   ├── index.ts                — Database connection + Drizzle client
│   │   ├── migrate.ts              — Run migrations programmatically
│   │   └── schema/
│   │       ├── index.ts            — Re-exports all schemas
│   │       ├── emails.ts           — emails table + Zod schemas
│   │       ├── github.ts           — github_pull_requests + github_issues + Zod schemas
│   │       ├── todoist.ts          — todoist_tasks table + Zod schemas
│   │       ├── work.ts             — email_github_links + work_notes tables + Zod schemas
│   │       └── settings.ts         — oauth_credentials + sync_config tables + Zod schemas
│   └── server.ts                   — Minimal Hono server (health check only for now)
├── tests/
│   ├── setup.ts                    — Test setup: DB connection, migrations, cleanup
│   ├── db/
│   │   ├── emails.test.ts          — Email table CRUD tests
│   │   ├── github.test.ts          — GitHub tables CRUD tests
│   │   ├── todoist.test.ts         — Todoist table CRUD tests
│   │   ├── work.test.ts            — Work notes + email_github_links tests
│   │   └── settings.test.ts        — Settings tables CRUD tests
│   └── server.test.ts              — Health check endpoint test
├── vitest.config.ts                — Vitest configuration
└── drizzle/                        — Generated migration files (by drizzle-kit)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.dockerignore`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "eight-arms",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install hono @hono/zod-openapi @hono/node-server zod drizzle-orm drizzle-zod postgres
npm install -D typescript tsx drizzle-kit vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 5: Create .dockerignore**

```
node_modules
dist
.git
*.md
```

- [ ] **Step 6: Create .gitignore**

```
node_modules
dist
drizzle/meta
*.env
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .dockerignore .gitignore
git commit -m "feat: initialize project with TypeScript, Drizzle, Vitest"
```

---

### Task 2: Docker Compose + Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-bookworm AS base
WORKDIR /app

# Install system dependencies for Claude Code CLI
RUN apt-get update && apt-get install -y \
    git \
    curl \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Dev stage: mount source, install deps, run with tsx
FROM base AS dev
COPY package.json package-lock.json ./
RUN npm ci
# Source is bind-mounted at runtime, not copied
CMD ["sh", "-c", "npm run db:migrate && npm run dev"]

# Prod stage: copy built assets, run compiled JS
FROM base AS prod
COPY package.json package-lock.json ./
RUN npm ci --production
COPY dist/ ./dist/
CMD ["sh", "-c", "npm run db:migrate && npm start"]
```

- [ ] **Step 2: Create docker-compose.yml**

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

- [ ] **Step 3: Create docker-compose.test.yml**

```yaml
services:
  app:
    build:
      context: .
      target: dev
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      DATABASE_URL: postgres://eight_arms:eight_arms@postgres:5432/eight_arms_test
      ENCRYPTION_KEY: test-encryption-key
      NODE_ENV: test
    depends_on:
      postgres:
        condition: service_healthy
    command: npm test

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: eight_arms
      POSTGRES_PASSWORD: eight_arms
      POSTGRES_DB: eight_arms_test
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U eight_arms"]
      interval: 2s
      timeout: 5s
      retries: 10
```

- [ ] **Step 4: Build and start the containers**

Run:
```bash
docker compose up --build -d
```

Expected: Both `app` and `postgres` containers start. `postgres` passes healthcheck, `app` starts but will fail (no server.ts yet — that's fine).

- [ ] **Step 5: Verify postgres is accessible**

Run:
```bash
docker compose exec postgres psql -U eight_arms -c "SELECT 1;"
```

Expected: Returns `1` confirming Postgres is running.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.test.yml
git commit -m "feat: add Docker Compose with app and postgres containers"
```

---

### Task 3: Database Connection + Drizzle Config

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/migrate.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Create drizzle.config.ts**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Create src/db/index.ts**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
export type Database = typeof db;
```

- [ ] **Step 3: Create src/db/migrate.ts**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts src/db/index.ts src/db/migrate.ts
git commit -m "feat: add Drizzle database connection and migration runner"
```

---

### Task 4: Schema — Emails Table

**Files:**
- Create: `src/db/schema/emails.ts`
- Create: `src/db/schema/index.ts`
- Create: `tests/setup.ts`
- Create: `tests/db/emails.test.ts`

- [ ] **Step 1: Create src/db/schema/emails.ts**

```ts
import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const emails = pgTable("emails", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  snippet: text("snippet").notNull().default(""),
  body: text("body").notNull().default(""),
  date: timestamp("date", { withTimezone: true }).notNull(),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailSchema = createInsertSchema(emails, {
  labels: z.array(z.string()),
});
export const selectEmailSchema = createSelectSchema(emails, {
  labels: z.array(z.string()),
});

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
```

- [ ] **Step 2: Create src/db/schema/index.ts**

```ts
export * from "./emails.js";
```

- [ ] **Step 3: Generate the migration**

Run inside the app container:
```bash
docker compose exec app npx drizzle-kit generate
```

Expected: Creates a migration file in `drizzle/` like `0000_xxx.sql` containing `CREATE TABLE "emails"`.

- [ ] **Step 4: Run the migration**

Run:
```bash
docker compose exec app npm run db:migrate
```

Expected: `Running migrations... Migrations complete.`

- [ ] **Step 5: Verify the table exists**

Run:
```bash
docker compose exec postgres psql -U eight_arms -c "\d emails"
```

Expected: Shows the `emails` table schema with all columns.

- [ ] **Step 6: Create tests/setup.ts**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema/index.js";
import { beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
export const testDb = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // Truncate all tables between tests
  const tables = await testDb.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  for (const { tablename } of tables) {
    if (tablename !== "__drizzle_migrations") {
      await testDb.execute(sql.raw(`TRUNCATE TABLE "${tablename}" CASCADE`));
    }
  }
});

afterAll(async () => {
  await client.end();
});
```

- [ ] **Step 7: Write the failing test — tests/db/emails.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { emails } from "../../src/db/schema/emails.js";
import { eq } from "drizzle-orm";

describe("emails table", () => {
  it("inserts and retrieves an email", async () => {
    const email = {
      id: "msg_001",
      threadId: "thread_001",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      snippet: "Hey there...",
      body: "Hey there, how are you?",
      date: new Date("2026-03-30T10:00:00Z"),
      labels: ["INBOX", "UNREAD"],
      isRead: false,
      isArchived: false,
    };

    await testDb.insert(emails).values(email);
    const result = await testDb.select().from(emails).where(eq(emails.id, "msg_001"));

    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Hello");
    expect(result[0].labels).toEqual(["INBOX", "UNREAD"]);
    expect(result[0].isRead).toBe(false);
  });

  it("updates email read status", async () => {
    await testDb.insert(emails).values({
      id: "msg_002",
      threadId: "thread_002",
      from: "bob@example.com",
      to: "me@example.com",
      subject: "Update",
      date: new Date("2026-03-30T11:00:00Z"),
    });

    await testDb.update(emails).set({ isRead: true }).where(eq(emails.id, "msg_002"));
    const result = await testDb.select().from(emails).where(eq(emails.id, "msg_002"));

    expect(result[0].isRead).toBe(true);
  });

  it("filters unread emails", async () => {
    await testDb.insert(emails).values([
      {
        id: "msg_003",
        threadId: "thread_003",
        from: "alice@example.com",
        to: "me@example.com",
        subject: "Read email",
        date: new Date("2026-03-30T10:00:00Z"),
        isRead: true,
      },
      {
        id: "msg_004",
        threadId: "thread_004",
        from: "bob@example.com",
        to: "me@example.com",
        subject: "Unread email",
        date: new Date("2026-03-30T11:00:00Z"),
        isRead: false,
      },
    ]);

    const unread = await testDb
      .select()
      .from(emails)
      .where(eq(emails.isRead, false));

    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe("msg_004");
  });
});
```

- [ ] **Step 8: Run the test**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test
```

Expected: All 3 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema/ tests/ drizzle/
git commit -m "feat: add emails table schema with tests"
```

---

### Task 5: Schema — GitHub Tables

**Files:**
- Create: `src/db/schema/github.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/db/github.test.ts`

- [ ] **Step 1: Create src/db/schema/github.ts**

```ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const githubPullRequests = pgTable("github_pull_requests", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  state: text("state").notNull(),
  isDraft: boolean("is_draft").notNull().default(false),
  reviewDecision: text("review_decision"),
  reviewRequests: jsonb("review_requests").$type<string[]>().notNull().default([]),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  files: jsonb("files")
    .$type<{ path: string; additions: number; deletions: number }[]>()
    .notNull()
    .default([]),
  ciStatus: text("ci_status"),
  branch: text("branch").notNull(),
  body: text("body").notNull().default(""),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  mergedBy: text("merged_by"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPullRequestSchema = createInsertSchema(githubPullRequests, {
  reviewRequests: z.array(z.string()),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
  ),
});
export const selectPullRequestSchema = createSelectSchema(githubPullRequests, {
  reviewRequests: z.array(z.string()),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
  ),
});

export type PullRequest = typeof githubPullRequests.$inferSelect;
export type NewPullRequest = typeof githubPullRequests.$inferInsert;

export const githubIssues = pgTable("github_issues", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  state: text("state").notNull(),
  assignees: jsonb("assignees").$type<string[]>().notNull().default([]),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  body: text("body").notNull().default(""),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIssueSchema = createInsertSchema(githubIssues, {
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
});
export const selectIssueSchema = createSelectSchema(githubIssues, {
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
});

export type Issue = typeof githubIssues.$inferSelect;
export type NewIssue = typeof githubIssues.$inferInsert;
```

- [ ] **Step 2: Update src/db/schema/index.ts**

```ts
export * from "./emails.js";
export * from "./github.js";
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
docker compose exec app npx drizzle-kit generate
docker compose exec app npm run db:migrate
```

Expected: New migration file created and applied. Tables `github_pull_requests` and `github_issues` exist.

- [ ] **Step 4: Write the failing test — tests/db/github.test.ts**

```ts
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
```

- [ ] **Step 5: Run the tests**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test
```

Expected: All tests pass (emails + github).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/github.ts src/db/schema/index.ts tests/db/github.test.ts drizzle/
git commit -m "feat: add github_pull_requests and github_issues tables with tests"
```

---

### Task 6: Schema — Todoist Tasks Table

**Files:**
- Create: `src/db/schema/todoist.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/db/todoist.test.ts`

- [ ] **Step 1: Create src/db/schema/todoist.ts**

```ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const todoistTasks = pgTable("todoist_tasks", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  description: text("description").notNull().default(""),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  priority: integer("priority").notNull().default(4),
  dueDate: timestamp("due_date", { withTimezone: true }),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  isCompleted: boolean("is_completed").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTodoistTaskSchema = createInsertSchema(todoistTasks, {
  labels: z.array(z.string()),
});
export const selectTodoistTaskSchema = createSelectSchema(todoistTasks, {
  labels: z.array(z.string()),
});

export type TodoistTask = typeof todoistTasks.$inferSelect;
export type NewTodoistTask = typeof todoistTasks.$inferInsert;
```

- [ ] **Step 2: Update src/db/schema/index.ts**

```ts
export * from "./emails.js";
export * from "./github.js";
export * from "./todoist.js";
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
docker compose exec app npx drizzle-kit generate
docker compose exec app npm run db:migrate
```

Expected: New migration applied. Table `todoist_tasks` exists.

- [ ] **Step 4: Write the failing test — tests/db/todoist.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { todoistTasks } from "../../src/db/schema/todoist.js";
import { eq } from "drizzle-orm";

describe("todoist_tasks table", () => {
  it("inserts and retrieves a task", async () => {
    const task = {
      id: "td_001",
      content: "Review Eight Arms PR",
      description: "Check the database schema changes",
      projectId: "proj_001",
      projectName: "Work",
      priority: 1,
      dueDate: new Date("2026-03-31T17:00:00Z"),
      labels: ["code-review", "eight-arms"],
      isCompleted: false,
    };

    await testDb.insert(todoistTasks).values(task);
    const result = await testDb
      .select()
      .from(todoistTasks)
      .where(eq(todoistTasks.id, "td_001"));

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Review Eight Arms PR");
    expect(result[0].priority).toBe(1);
    expect(result[0].labels).toEqual(["code-review", "eight-arms"]);
  });

  it("filters by completion status", async () => {
    await testDb.insert(todoistTasks).values([
      {
        id: "td_002",
        content: "Done task",
        projectId: "proj_001",
        projectName: "Work",
        isCompleted: true,
      },
      {
        id: "td_003",
        content: "Open task",
        projectId: "proj_001",
        projectName: "Work",
        isCompleted: false,
      },
    ]);

    const active = await testDb
      .select()
      .from(todoistTasks)
      .where(eq(todoistTasks.isCompleted, false));

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("td_003");
  });
});
```

- [ ] **Step 5: Run the tests**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/todoist.ts src/db/schema/index.ts tests/db/todoist.test.ts drizzle/
git commit -m "feat: add todoist_tasks table with tests"
```

---

### Task 7: Schema — Work Notes + Email-GitHub Links

**Files:**
- Create: `src/db/schema/work.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/db/work.test.ts`

- [ ] **Step 1: Create src/db/schema/work.ts**

```ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const emailGithubLinks = pgTable("email_github_links", {
  id: serial("id").primaryKey(),
  emailThreadId: text("email_thread_id").notNull(),
  sourceType: text("source_type").notNull(), // 'pull_request' | 'issue'
  sourceId: text("source_id").notNull(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
});

export const insertEmailGithubLinkSchema = createInsertSchema(emailGithubLinks);
export const selectEmailGithubLinkSchema = createSelectSchema(emailGithubLinks);

export type EmailGithubLink = typeof emailGithubLinks.$inferSelect;
export type NewEmailGithubLink = typeof emailGithubLinks.$inferInsert;

export const workNotes = pgTable("work_notes", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // 'email' | 'pull_request' | 'issue' | 'todoist_task'
  sourceId: text("source_id").notNull(),
  notes: text("notes").notNull().default(""),
  estimate: text("estimate"), // e.g. "30m", "2h"
  isActionable: boolean("is_actionable").notNull().default(false),
  groomedAt: timestamp("groomed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkNoteSchema = createInsertSchema(workNotes);
export const selectWorkNoteSchema = createSelectSchema(workNotes);

export type WorkNote = typeof workNotes.$inferSelect;
export type NewWorkNote = typeof workNotes.$inferInsert;
```

- [ ] **Step 2: Update src/db/schema/index.ts**

```ts
export * from "./emails.js";
export * from "./github.js";
export * from "./todoist.js";
export * from "./work.js";
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
docker compose exec app npx drizzle-kit generate
docker compose exec app npm run db:migrate
```

Expected: Migration applied. Tables `email_github_links` and `work_notes` exist.

- [ ] **Step 4: Write the failing test — tests/db/work.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { emailGithubLinks, workNotes } from "../../src/db/schema/work.js";
import { emails } from "../../src/db/schema/emails.js";
import { githubPullRequests } from "../../src/db/schema/github.js";
import { eq, and } from "drizzle-orm";

describe("email_github_links table", () => {
  it("links an email thread to a pull request", async () => {
    // Insert prerequisite data
    await testDb.insert(emails).values({
      id: "msg_010",
      threadId: "thread_010",
      from: "notifications@github.com",
      to: "me@example.com",
      subject: "[acme/widget] Add feature (PR #42)",
      date: new Date("2026-03-30T10:00:00Z"),
    });

    await testDb.insert(githubPullRequests).values({
      id: "PR_node_010",
      repo: "acme/widget",
      number: 42,
      title: "Add feature",
      author: "alice",
      state: "OPEN",
      branch: "feature",
    });

    await testDb.insert(emailGithubLinks).values({
      emailThreadId: "thread_010",
      sourceType: "pull_request",
      sourceId: "PR_node_010",
      repo: "acme/widget",
      number: 42,
    });

    const result = await testDb
      .select()
      .from(emailGithubLinks)
      .where(eq(emailGithubLinks.emailThreadId, "thread_010"));

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("pull_request");
    expect(result[0].sourceId).toBe("PR_node_010");
  });
});

describe("work_notes table", () => {
  it("creates a note for a work item", async () => {
    await testDb.insert(workNotes).values({
      sourceType: "pull_request",
      sourceId: "PR_node_010",
      notes: "Need to check the error handling in the auth module",
      estimate: "1h",
      isActionable: true,
    });

    const result = await testDb
      .select()
      .from(workNotes)
      .where(
        and(
          eq(workNotes.sourceType, "pull_request"),
          eq(workNotes.sourceId, "PR_node_010")
        )
      );

    expect(result).toHaveLength(1);
    expect(result[0].notes).toBe(
      "Need to check the error handling in the auth module"
    );
    expect(result[0].estimate).toBe("1h");
    expect(result[0].isActionable).toBe(true);
  });

  it("updates existing notes", async () => {
    const [inserted] = await testDb
      .insert(workNotes)
      .values({
        sourceType: "issue",
        sourceId: "I_node_001",
        notes: "Initial notes",
        isActionable: false,
      })
      .returning();

    await testDb
      .update(workNotes)
      .set({ notes: "Refined notes", estimate: "30m", isActionable: true })
      .where(eq(workNotes.id, inserted.id));

    const result = await testDb
      .select()
      .from(workNotes)
      .where(eq(workNotes.id, inserted.id));

    expect(result[0].notes).toBe("Refined notes");
    expect(result[0].estimate).toBe("30m");
    expect(result[0].isActionable).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/work.ts src/db/schema/index.ts tests/db/work.test.ts drizzle/
git commit -m "feat: add email_github_links and work_notes tables with tests"
```

---

### Task 8: Schema — Settings Tables

**Files:**
- Create: `src/db/schema/settings.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/db/settings.test.ts`

- [ ] **Step 1: Create src/db/schema/settings.ts**

```ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const oauthCredentials = pgTable("oauth_credentials", {
  id: serial("id").primaryKey(),
  service: text("service").notNull().unique(), // 'gmail' | 'github' | 'todoist'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull().default(""),
});

export const insertOauthCredentialSchema = createInsertSchema(oauthCredentials);
export const selectOauthCredentialSchema = createSelectSchema(oauthCredentials);

export type OauthCredential = typeof oauthCredentials.$inferSelect;
export type NewOauthCredential = typeof oauthCredentials.$inferInsert;

export const syncConfig = pgTable("sync_config", {
  id: serial("id").primaryKey(),
  service: text("service").notNull().unique(), // 'gmail' | 'github' | 'todoist'
  intervalMinutes: integer("interval_minutes").notNull().default(5),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
});

export const insertSyncConfigSchema = createInsertSchema(syncConfig);
export const selectSyncConfigSchema = createSelectSchema(syncConfig);

export type SyncConfig = typeof syncConfig.$inferSelect;
export type NewSyncConfig = typeof syncConfig.$inferInsert;
```

- [ ] **Step 2: Update src/db/schema/index.ts**

```ts
export * from "./emails.js";
export * from "./github.js";
export * from "./todoist.js";
export * from "./work.js";
export * from "./settings.js";
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
docker compose exec app npx drizzle-kit generate
docker compose exec app npm run db:migrate
```

Expected: Migration applied. Tables `oauth_credentials` and `sync_config` exist.

- [ ] **Step 4: Write the failing test — tests/db/settings.test.ts**

```ts
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
```

- [ ] **Step 5: Run the tests**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/settings.ts src/db/schema/index.ts tests/db/settings.test.ts drizzle/
git commit -m "feat: add oauth_credentials and sync_config tables with tests"
```

---

### Task 9: Minimal Hono Server + Health Check

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Write the failing test — tests/server.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { app } from "../src/server.js";

describe("server", () => {
  it("returns 200 on health check", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test -- tests/server.test.ts
```

Expected: FAIL — cannot find module `../src/server.js`

- [ ] **Step 3: Create src/server.ts**

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";

export const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

const port = parseInt(process.env.PORT || "3000", 10);

// Only start the server if this file is run directly (not imported by tests)
if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
docker compose -f docker-compose.test.yml run --rm app npm test -- tests/server.test.ts
```

Expected: PASS

- [ ] **Step 5: Verify the server starts in Docker**

Run:
```bash
docker compose up --build -d
docker compose exec app curl -s http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add src/server.ts tests/server.test.ts package.json package-lock.json
git commit -m "feat: add minimal Hono server with health check endpoint"
```

---

### Task 10: Verify Claude Code Works in Container

**Files:** None — this is a verification task.

- [ ] **Step 1: Exec into the app container**

Run:
```bash
docker compose exec app bash
```

- [ ] **Step 2: Verify Claude Code is installed**

Run inside container:
```bash
claude --version
```

Expected: Prints the Claude Code version.

- [ ] **Step 3: Verify the project directory is mounted**

Run inside container:
```bash
ls /app/package.json /app/src/db/schema/
```

Expected: Lists `package.json` and all schema files.

- [ ] **Step 4: Verify Postgres is accessible from the container**

Run inside container:
```bash
node -e "import('postgres').then(m => m.default(process.env.DATABASE_URL)('SELECT 1 as ok').then(r => { console.log(r); process.exit(0); }))"
```

Expected: Prints `[ { ok: 1 } ]`

- [ ] **Step 5: Verify tests can run inside the container**

Run inside container:
```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Exit the container**

Run:
```bash
exit
```

No commit needed — this was a verification task.
