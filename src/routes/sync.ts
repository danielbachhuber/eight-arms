import { Hono } from "hono";
import { db } from "../db/index.js";
import { runSync } from "../services/sync-runner.js";
import type { ServiceName } from "../services/oauth-providers.js";

const sync = new Hono();

sync.post("/trigger", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const services = body.services as ServiceName[] | undefined;

  const results = await runSync(db, services);
  return c.json({ results });
});

export { sync };
