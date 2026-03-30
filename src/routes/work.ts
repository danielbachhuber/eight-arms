import { Hono } from "hono";
import { db } from "../db/index.js";
import { listWork, getWorkNotes, saveWorkNotes } from "../services/queries.js";

const workRoutes = new Hono();

workRoutes.get("/", async (c) => {
  const repo = c.req.query("repo");
  const sourceType = c.req.query("sourceType");
  const groomed = c.req.query("groomed");
  const limit = c.req.query("limit");

  const result = await listWork(db, {
    repo: repo || undefined,
    sourceType: sourceType || undefined,
    groomed: groomed === "true" ? true : groomed === "false" ? false : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

workRoutes.get("/notes", async (c) => {
  const sourceType = c.req.query("sourceType");
  const sourceId = c.req.query("sourceId");

  if (!sourceType || !sourceId) {
    return c.json({ error: "sourceType and sourceId required" }, 400);
  }

  const result = await getWorkNotes(db, sourceType, sourceId);
  return c.json(result);
});

workRoutes.post("/notes", async (c) => {
  const body = await c.req.json();
  const { sourceType, sourceId, notes, estimate, isActionable } = body;

  if (!sourceType || !sourceId || notes === undefined) {
    return c.json({ error: "sourceType, sourceId, and notes required" }, 400);
  }

  await saveWorkNotes(db, { sourceType, sourceId, notes, estimate, isActionable });
  return c.json({ ok: true });
});

export { workRoutes };
