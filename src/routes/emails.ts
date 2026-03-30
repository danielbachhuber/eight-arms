import { Hono } from "hono";
import { db } from "../db/index.js";
import { listEmails, getEmail, archiveEmail } from "../services/queries.js";
import { getCredentials } from "../services/credentials.js";

const emailRoutes = new Hono();

emailRoutes.get("/", async (c) => {
  const unread = c.req.query("unread");
  const hasGithubLink = c.req.query("hasGithubLink");
  const limit = c.req.query("limit");

  const result = await listEmails(db, {
    unread: unread === "true" ? true : unread === "false" ? false : undefined,
    hasGithubLink: hasGithubLink === "true" ? true : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

emailRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getEmail(db, id);
  if (!result) {
    return c.json({ error: "Email not found" }, 404);
  }
  return c.json(result);
});

emailRoutes.post("/:id/archive", async (c) => {
  const id = c.req.param("id");

  // Archive in DB
  await archiveEmail(db, id);

  // Also archive in Gmail if connected
  try {
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
    // Gmail archive failed but DB is updated — acceptable
  }

  return c.json({ ok: true });
});

export { emailRoutes };
