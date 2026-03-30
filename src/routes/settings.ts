import { Hono } from "hono";
import { db } from "../db/index.js";
import { getConnectionStatus, saveCredentials } from "../services/credentials.js";
import { getProvider, type ServiceName } from "../services/oauth-providers.js";
import { buildAuthUrl, exchangeCode } from "../services/oauth.js";
import crypto from "node:crypto";

const settings = new Hono();

// In-memory state store for OAuth CSRF protection
const oauthStates = new Map<string, { service: ServiceName; expiresAt: number }>();

settings.get("/", async (c) => {
  const status = await getConnectionStatus(db);
  return c.json({ services: status });
});

settings.post("/oauth/:service/start", async (c) => {
  const service = c.req.param("service") as ServiceName;
  if (!["gmail", "github", "todoist"].includes(service)) {
    return c.json({ error: "Invalid service" }, 400);
  }

  const provider = getProvider(service);
  const state = crypto.randomBytes(32).toString("hex");
  oauthStates.set(state, { service, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = buildAuthUrl(provider, state);
  return c.json({ url });
});

settings.get("/oauth/:service/callback", async (c) => {
  const service = c.req.param("service") as ServiceName;
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const stored = oauthStates.get(state);
  if (!stored || stored.service !== service || stored.expiresAt < Date.now()) {
    return c.json({ error: "Invalid or expired state" }, 400);
  }
  oauthStates.delete(state);

  const provider = getProvider(service);
  const tokens = await exchangeCode(provider, code);
  await saveCredentials(db, service, tokens);

  // Redirect to settings page after successful auth
  return c.redirect("/settings?connected=" + service);
});

export { settings };
