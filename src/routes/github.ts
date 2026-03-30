import { Hono } from "hono";
import { db } from "../db/index.js";
import { listPulls, getPull, listIssues, getIssue } from "../services/queries.js";

const githubRoutes = new Hono();

githubRoutes.get("/pulls", async (c) => {
  const repo = c.req.query("repo");
  const reviewStatus = c.req.query("reviewStatus");
  const limit = c.req.query("limit");

  const result = await listPulls(db, {
    repo: repo || undefined,
    reviewStatus: reviewStatus || undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

githubRoutes.get("/pulls/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getPull(db, id);
  if (!result) {
    return c.json({ error: "Pull request not found" }, 404);
  }
  return c.json(result);
});

githubRoutes.get("/issues", async (c) => {
  const repo = c.req.query("repo");
  const state = c.req.query("state");
  const limit = c.req.query("limit");

  const result = await listIssues(db, {
    repo: repo || undefined,
    state: state || undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

githubRoutes.get("/issues/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getIssue(db, id);
  if (!result) {
    return c.json({ error: "Issue not found" }, 404);
  }
  return c.json(result);
});

export { githubRoutes };
