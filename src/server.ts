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
