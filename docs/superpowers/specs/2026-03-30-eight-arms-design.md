# Eight Arms — Design Spec

A single-user personal productivity hub that syncs Gmail, GitHub, and Todoist data into a local Postgres database, exposing it via a Hono REST API (with auto-generated OpenAPI spec), an MCP stdio server (for Claude), and a Vite+React read-only dashboard.

## Architecture Overview

**Docker Compose services:**
- **app** — Node.js container running the Hono API server, serving the built Vite dashboard, housing the MCP stdio entrypoint, and running cron jobs for data syncing
- **postgres** — PostgreSQL database

**Key entrypoints in the app container:**
- `src/server.ts` — Hono API + static dashboard serving
- `src/mcp.ts` — MCP stdio server (launched by Claude as a local MCP server, connects to same Postgres)
- Cron jobs — system cron inside the container triggers sync scripts on a configurable interval

**Shared code:** Zod schemas define the data model once. Drizzle uses them for DB schema, Hono uses them for route validation + OpenAPI generation, MCP uses them for tool input/output validation.

**Skills:** Three Claude skills live in `./skills/` in the repo. Inside the container they are mounted to `~/.claude/skills/`. On the host machine, the user manually symlinks them to the same path.

## Database Schema

Uses Drizzle ORM with Drizzle Kit for migrations. Migrations run automatically on container startup.

### Core Data Tables

**emails**
- id (string, Gmail message ID)
- threadId (string)
- from (string)
- to (string)
- subject (string)
- snippet (string)
- body (text)
- date (timestamp)
- labels (jsonb — array of Gmail label strings)
- isRead (boolean)
- isArchived (boolean)
- syncedAt (timestamp)

**github_pull_requests**
- id (string, GitHub node ID)
- repo (string — `owner/repo`)
- number (integer)
- title (string)
- author (string)
- state (string — OPEN, CLOSED, MERGED)
- isDraft (boolean)
- reviewDecision (string — APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or null)
- reviewRequests (jsonb — array of requested reviewer logins)
- additions (integer)
- deletions (integer)
- files (jsonb — array of file objects with path, additions, deletions)
- ciStatus (string — summary of status check rollup)
- branch (string)
- body (text)
- mergedAt (timestamp, nullable)
- mergedBy (string, nullable)
- syncedAt (timestamp)

**github_issues**
- id (string, GitHub node ID)
- repo (string — `owner/repo`)
- number (integer)
- title (string)
- author (string)
- state (string — OPEN, CLOSED)
- assignees (jsonb — array of logins)
- labels (jsonb — array of label strings)
- body (text)
- closedAt (timestamp, nullable)
- syncedAt (timestamp)

**todoist_tasks**
- id (string, Todoist task ID)
- content (string)
- description (text)
- projectId (string)
- projectName (string)
- priority (integer — 1-4)
- dueDate (timestamp, nullable)
- labels (jsonb — array of label strings)
- isCompleted (boolean)
- syncedAt (timestamp)

### Correlation Table

**email_github_links**
- id (serial)
- emailThreadId (string, FK to emails.threadId)
- sourceType (string — `pull_request` or `issue`)
- sourceId (string — FK to github_pull_requests.id or github_issues.id)
- repo (string)
- number (integer)

Maps GitHub notification emails to their corresponding PR or issue.

### Work Management

**work_notes**
- id (serial)
- sourceType (string — `email`, `pull_request`, `issue`, `todoist_task`)
- sourceId (string)
- notes (text)
- estimate (string, nullable — duration like "30m", "2h")
- isActionable (boolean)
- groomedAt (timestamp)

### Settings

**oauth_credentials**
- id (serial)
- service (string — `gmail`, `github`, `todoist`)
- accessToken (text, encrypted)
- refreshToken (text, encrypted)
- expiresAt (timestamp, nullable)
- scopes (text)

**sync_config**
- id (serial)
- service (string — `gmail`, `github`, `todoist`)
- intervalMinutes (integer, default 5)
- lastSyncAt (timestamp, nullable)
- enabled (boolean, default true)

## API Design

Hono API with `@hono/zod-openapi` for validated routes and auto-generated OpenAPI spec.

### Endpoints

```
GET  /api/emails              — list inbox emails (filters: read/unread, label, hasGithubLink)
GET  /api/emails/:id          — single email with full body + linked GitHub data
POST /api/emails/:id/archive  — archive an email (updates DB + archives in Gmail)

GET  /api/pulls               — list PRs (filters: repo, reviewStatus)
GET  /api/pulls/:id           — single PR with full detail
GET  /api/issues              — list issues (filters: repo, state)
GET  /api/issues/:id          — single issue with full detail

GET  /api/todoist/tasks       — list Todoist tasks (filters: project, priority)
GET  /api/todoist/tasks/:id   — single task

GET  /api/work                — unified view of all work items across all sources
GET  /api/work/notes?sourceType=:type&sourceId=:id  — get notes for a work item
POST /api/work/notes                                — add/update notes (body: sourceType, sourceId, notes, estimate, isActionable)

GET  /api/settings            — get connected services status
POST /api/settings/oauth/:service/start    — initiate OAuth flow
GET  /api/settings/oauth/:service/callback — OAuth callback

POST /api/sync/trigger        — manually trigger a sync

GET  /api/openapi.json        — auto-generated OpenAPI spec
```

`/api/work` returns a flat list of work items across all sources with metadata and grooming status. No prioritization logic — Claude applies its own judgment. Supports filtering by repo, sourceType, and groomed/ungroomed.

## MCP Server

Stdio-based MCP server (`src/mcp.ts`) that Claude launches as a local tool server. Reuses the same Zod schemas and service layer as the API.

### Tools

- `list_emails` — query emails (filters: unread, label, hasGithubLink)
- `get_email` — full email detail with linked GitHub data
- `archive_email` — archive an email
- `list_pulls` — query PRs (filters: repo, reviewStatus)
- `get_pull` — full PR detail
- `list_issues` — query issues (filters: repo, state)
- `get_issue` — full issue detail
- `list_todoist_tasks` — query tasks (filters: project, priority)
- `get_todoist_task` — full task detail
- `list_work` — unified view across all sources (filters: repo, sourceType, groomed/ungroomed)
- `get_work_notes` — get notes for a work item
- `save_work_notes` — add/update notes from groom-work
- `trigger_sync` — manually trigger a data sync
Note: repo context is not provided by an MCP tool. The skills detect the current repo by running `git remote get-url origin` in the user's shell and pass it as a filter parameter to `list_work` and other tools.

## Skills

Three skills in `./skills/`, each a `SKILL.md` file. Mounted into the container at `~/.claude/skills/`. Symlinked on the host machine.

### inbox-zero

Process inbox emails one at a time, most important first.

- Calls `list_emails` (unread) to get all emails from MCP
- Presents one email at a time with full context (calls `get_email` for detail, includes linked PR/issue data)
- Prioritization: emails from real people over automated, urgent over FYI, actionable over informational
- Actions per email: Archive, Reply (draft), Task & Archive (create Todoist task), Delegate, Skip, Review (enter interactive PR review mode)
- PR review mode: file-by-file review via `gh` CLI (direct GitHub interaction, not through the app). Accumulate comments and submit as a batch review.
- Archiving calls `archive_email` which updates both the DB and Gmail
- Port of existing inbox-zero skill, reading from MCP instead of `gws`

### groom-work

Sequential processing of work items, inbox-zero style.

- Detects current repo from `git remote get-url origin`, then calls `list_work` optionally filtered by that repo
- Presents one item at a time with full context
- For each item, either:
  - **Refine** — help the user outline the work, estimate effort, break it down. Saves notes via `save_work_notes`
  - **Act** — if the item is already actionable, do it right then (review a PR, work an issue, complete a task)
- Marks items as groomed with notes, estimates, and actionable status

### next

Quick decision tool: "what should I do right now?"

- Detects current repo by running `git remote get-url origin` in the user's shell, then calls `list_work` filtered by that repo
- Asks how much time the user has available
- Claude applies its own prioritization judgment based on: source type, grooming status, estimated effort vs. available time, urgency, and context
- Recommends the single best thing to work on

## Sync System

Cron jobs inside the app container trigger sync scripts on a configurable interval (default: every 5 minutes).

### Three Independent Sync Jobs

**Gmail sync**
- Fetches inbox messages via Gmail API (OAuth authenticated)
- Stores metadata and body for each message
- Detects GitHub notification emails (from `notifications@github.com`) and creates entries in `email_github_links`
- Incremental: uses `after:` date queries based on last sync time

**GitHub sync**
- Fetches PRs where the user is a requested reviewer or author
- Fetches issues assigned to the user
- Across all repos the user has access to
- Incremental: uses `since` parameter based on last sync time

**Todoist sync**
- Fetches all active tasks via Todoist Sync API
- Stores task metadata including project, priority, due date, labels

### Sync Behavior

- Each job is independent — one failing does not block the others
- Each record gets a `syncedAt` timestamp
- `sync_config` table tracks last sync time and enabled/disabled per service
- Manual sync available via `trigger_sync` MCP tool or `POST /api/sync/trigger`
- Cron implementation: system cron in the container runs a small Node script that hits the internal sync logic. Configured via a crontab baked into the Docker image.

## Dashboard

Read-only Vite + React SPA served as static files by the Hono server.

### Two Panels

**Needs My Attention**
Items where another person is specifically waiting on me:
- PRs where I'm an explicit requested reviewer (shows: repo, title, author, files changed, lines changed, CI status)
- Emails from real people awaiting a response (shows: from, subject, date)
- Todoist tasks shared/delegated to me by someone else

**My Work**
Everything else on my plate:
- Assigned GitHub issues
- My Todoist tasks
- PRs I authored (with CI/review status)
- Notification emails (GitHub notifications, automated updates)
- Groomed items show their notes and estimates

Each item displays its source (Gmail, GitHub, Todoist) as a subtle badge with relevant metadata.

## Testing Strategy

### Contract Tests (API Layer)
- Every Hono route defined with `@hono/zod-openapi` gets automatic request/response validation
- Tests verify each endpoint returns data conforming to its Zod schema
- OpenAPI spec is snapshot-tested to catch unintended API changes

### Integration Tests (Data Layer)
- Run against a real Postgres instance (test-specific Docker Compose service)
- Test Drizzle queries, migrations, sync logic, and the service layer
- External APIs (Gmail, GitHub, Todoist) mocked at the HTTP boundary using `msw` (Mock Service Worker)

### MCP Tool Tests
- Test that each MCP tool calls the correct service layer function with the right parameters
- Validate tool input/output against the shared Zod schemas
- Run against real Postgres with mocked external APIs

### Running Tests
`docker compose -f docker-compose.test.yml up` spins up Postgres, runs migrations, and executes the test suite. Claude can run this from inside the container.

## Authentication

All three services use OAuth2, managed through a settings page in the dashboard.

- **Gmail** — Google OAuth2 consent flow. App registers as an OAuth client, user authorizes on first setup. Refresh tokens stored in `oauth_credentials` table.
- **GitHub** — GitHub OAuth App flow. User authorizes, tokens stored in DB.
- **Todoist** — Todoist OAuth flow. User authorizes, tokens stored in DB.

The settings page shows connection status for each service and allows connecting/reconnecting. Credentials are stored encrypted in the database. The encryption key is derived from an `ENCRYPTION_KEY` environment variable set in the Docker Compose config.

## Development Workflow

The app container mounts the local project directory so files are written to the host and can be committed with git from the host machine.

**Development mode:**
1. `docker compose up` starts the app container and Postgres
2. The project directory is bind-mounted into the app container (e.g., `/app`)
3. Run `claude --dangerously-skip-permissions` inside the app container to implement code
4. Claude inside the container has direct access to Postgres for testing
5. Files written by Claude appear on the host via the bind mount
6. Git commits happen from the host machine

The app container needs: Node.js, Claude Code CLI, git, and development dependencies. The Dockerfile should support both a dev mode (with Claude, hot reload) and a production mode (built assets, no dev tools).

## Tech Stack Summary

- **Runtime:** Node.js
- **API:** Hono + @hono/zod-openapi
- **Database:** PostgreSQL + Drizzle ORM + Drizzle Kit (migrations)
- **Validation/Schemas:** Zod (shared across API, MCP, and DB)
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **Frontend:** Vite + React
- **Testing:** Vitest + msw + testcontainers (or test Docker Compose)
- **Infrastructure:** Docker Compose (app + postgres)
- **Sync:** System cron in app container
