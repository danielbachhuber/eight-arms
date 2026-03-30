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
