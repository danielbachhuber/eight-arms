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

  const provider = await getProvider(service);
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

  const provider = await getProvider(service);
  const tokens = await exchangeCode(provider, code);
  await saveCredentials(db, service, tokens);

  return c.redirect("/settings?connected=" + service);
});

// Save a personal access token directly (for GitHub/Todoist)
settings.post("/token/:service", async (c) => {
  const service = c.req.param("service") as ServiceName;
  if (!["github", "todoist"].includes(service)) {
    return c.json({ error: "Token auth only supported for github and todoist" }, 400);
  }

  const body = await c.req.json();
  const token = body.token as string;
  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  await saveCredentials(db, service, {
    accessToken: token,
    refreshToken: "",
    expiresAt: null,
    scopes: "",
  });

  return c.json({ ok: true, service });
});

// Delete credentials for a service
settings.post("/disconnect/:service", async (c) => {
  const service = c.req.param("service") as ServiceName;
  if (!["gmail", "github", "todoist"].includes(service)) {
    return c.json({ error: "Invalid service" }, 400);
  }

  const { deleteCredentials } = await import("../services/credentials.js");
  await deleteCredentials(db, service);
  return c.json({ ok: true, service });
});

// Save OAuth app config (client ID + secret)
settings.post("/oauth-config/:service", async (c) => {
  const service = c.req.param("service") as ServiceName;
  if (!["gmail", "github", "todoist"].includes(service)) {
    return c.json({ error: "Invalid service" }, 400);
  }

  const body = await c.req.json();
  const clientId = body.clientId as string;
  const clientSecret = body.clientSecret as string;
  if (!clientId || !clientSecret) {
    return c.json({ error: "Missing clientId or clientSecret" }, 400);
  }

  const { oauthAppConfig } = await import("../db/schema/settings.js");
  await db
    .insert(oauthAppConfig)
    .values({ service, clientId, clientSecret })
    .onConflictDoUpdate({
      target: oauthAppConfig.service,
      set: { clientId, clientSecret },
    });

  return c.json({ ok: true, service });
});

// Get OAuth app config status (which services have client IDs configured)
settings.get("/oauth-config", async (c) => {
  const { oauthAppConfig } = await import("../db/schema/settings.js");
  const configs = await db.select().from(oauthAppConfig);
  const configured = Object.fromEntries(configs.map((c) => [c.service, true]));
  return c.json({ configured });
});

// Serve settings page
settings.get("/page", async (c) => {
  const status = await getConnectionStatus(db);
  const { oauthAppConfig } = await import("../db/schema/settings.js");
  const configs = await db.select().from(oauthAppConfig);
  const oauthConfigured = Object.fromEntries(configs.map((c) => [c.service, true]));
  const { settingsPage } = await import("../views/settings-page.js");
  return c.html(settingsPage({ services: status, oauthConfigured }));
});

export { settings };
