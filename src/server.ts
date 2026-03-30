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

// Page routes — redirect to the settings route handler in settings.ts
app.get("/settings", async (c) => {
  return c.redirect("/api/settings/page");
});

const port = parseInt(process.env.PORT || "3210", 10);

if (process.env.NODE_ENV !== "test") {
  console.log(`Starting server on port ${port}`);
  serve({ fetch: app.fetch, port });
  startCron();
}
