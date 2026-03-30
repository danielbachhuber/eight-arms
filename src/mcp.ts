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
