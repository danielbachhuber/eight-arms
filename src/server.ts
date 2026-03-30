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
