# Eight Arms

A personal productivity hub that syncs Gmail, GitHub, and Todoist data into a local Postgres database. Exposes data via a REST API and MCP server for Claude integration.

## Quick Start

```bash
# Start the app and database
docker compose up --build -d

# Open the settings page to connect your accounts
open http://localhost:3210/settings
```

Connect your services:
- **GitHub** — paste a [Personal Access Token](https://github.com/settings/tokens) (classic, with `repo` and `read:org` scopes)
- **Todoist** — paste your [API token](https://todoist.com/app/settings/integrations/developer)
- **Gmail** — enter your Google Cloud OAuth client ID and secret, then click Connect

Sync your data:
```bash
docker compose exec app pnpm sync            # sync all connected services
docker compose exec app pnpm sync github      # sync just GitHub
docker compose exec app pnpm sync todoist     # sync just Todoist
docker compose exec app pnpm sync gmail       # sync just Gmail
```

Data syncs automatically every 5 minutes while the app is running.

## API

All data is available at `http://localhost:3210/api/`:

| Endpoint | Description |
|---|---|
| `GET /api/emails` | List emails (query: `unread`, `hasGithubLink`, `limit`) |
| `GET /api/emails/:id` | Email detail with linked GitHub PR/issue data |
| `POST /api/emails/:id/archive` | Archive email (DB + Gmail) |
| `GET /api/pulls` | List pull requests (query: `repo`, `reviewStatus`, `limit`) |
| `GET /api/pulls/:id` | PR detail |
| `GET /api/issues` | List issues (query: `repo`, `state`, `limit`) |
| `GET /api/issues/:id` | Issue detail |
| `GET /api/todoist/tasks` | List Todoist tasks (query: `project`, `priority`, `limit`) |
| `GET /api/todoist/tasks/:id` | Task detail |
| `GET /api/work` | Unified work view (query: `repo`, `sourceType`, `groomed`, `limit`) |
| `GET /api/work/notes` | Get work notes (query: `sourceType`, `sourceId`) |
| `POST /api/work/notes` | Save work notes |
| `POST /api/sync/trigger` | Trigger sync |
| `GET /api/openapi.json` | OpenAPI spec |

## MCP Server

Eight Arms includes an MCP server for Claude integration, served over HTTP from the app. Add to your Claude settings:

```json
{
  "mcpServers": {
    "eight-arms": {
      "url": "http://localhost:3210/mcp"
    }
  }
}
```

The MCP server runs inside the Docker container as part of the app. Claude connects to it over HTTP at `localhost:3210/mcp`.

### Available MCP Tools

`list_emails`, `get_email`, `archive_email`, `list_pulls`, `get_pull`, `list_issues`, `get_issue`, `list_todoist_tasks`, `get_todoist_task`, `list_work`, `get_work_notes`, `save_work_notes`, `trigger_sync`

## Skills

Claude skills live in `./skills/`. Symlink them to `~/.claude/skills/` for local use:

```bash
ln -s $(pwd)/skills/inbox-zero ~/.claude/skills/inbox-zero
```

| Skill | Description |
|---|---|
| `/inbox-zero` | Process inbox emails one at a time with bulk archive suggestions |
| `/groom-work` | Sequential work item refinement and action |
| `/next` | Quick decision: what should I do right now? |

## Development

```bash
# Run tests
docker compose -f docker-compose.test.yml run --rm app pnpm test

# Generate a DB migration after schema changes
docker compose exec app npx drizzle-kit generate
docker compose exec app pnpm run db:migrate

# Run Claude inside the container
docker compose exec app claude --dangerously-skip-permissions
```

## Architecture

- **App container** — Node.js, Hono API server, cron sync, Claude Code CLI
- **Postgres container** — PostgreSQL 16
- **Shared Zod schemas** — used by Drizzle ORM, API routes, and MCP tools
- **Service layer** (`src/services/queries.ts`) — shared by API and MCP

## Tech Stack

Node.js, TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod, Vite + React (dashboard), MCP SDK, Vitest, Docker Compose
