import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { settings } from "./routes/settings.js";
import { sync } from "./routes/sync.js";
import { emailRoutes } from "./routes/emails.js";
import { githubRoutes } from "./routes/github.js";
import { todoistRoutes } from "./routes/todoist.js";
import { workRoutes } from "./routes/work.js";
import { startCron } from "./cron.js";

export const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

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

app.route("/api/settings", settings);
app.route("/api/sync", sync);
app.route("/api/emails", emailRoutes);
app.route("/api", githubRoutes);
app.route("/api/todoist", todoistRoutes);
app.route("/api/work", workRoutes);

// Page routes
app.get("/settings", async (c) => {
  return c.redirect("/api/settings/page");
});

// Root handler — catches Gmail OAuth callback (Google redirects to http://localhost:PORT?code=...)
app.get("/", async (c) => {
  const code = c.req.query("code");
  if (code) {
    // This is a Gmail OAuth callback
    const { getProvider } = await import("./services/oauth-providers.js");
    const { exchangeCode } = await import("./services/oauth.js");
    const { saveCredentials } = await import("./services/credentials.js");
    const { db: database } = await import("./db/index.js");

    try {
      const provider = await getProvider("gmail");
      const tokens = await exchangeCode(provider, code);
      await saveCredentials(database, "gmail", tokens);
      return c.redirect("/settings?connected=gmail");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.html(`<h2>Gmail connection failed</h2><p>${msg}</p><p><a href="/settings">Back to settings</a></p>`);
    }
  }

  return c.redirect("/settings");
});

const port = parseInt(process.env.PORT || "3210", 10);

if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
  startCron();
}
