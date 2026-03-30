import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { oauthCredentials } from "../db/schema/settings.js";
import type { ServiceName } from "./oauth-providers.js";
import { getProvider } from "./oauth-providers.js";
import { refreshAccessToken, type TokenResponse } from "./oauth.js";

export async function getCredentials(
  db: Database,
  service: ServiceName
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null } | null> {
  const [cred] = await db
    .select()
    .from(oauthCredentials)
    .where(eq(oauthCredentials.service, service));

  if (!cred) return null;

  // If token is expired or expiring within 5 minutes, refresh it (skip for PATs with no refresh token)
  if (cred.refreshToken && cred.expiresAt && cred.expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    const provider = getProvider(service);
    const refreshed = await refreshAccessToken(provider, cred.refreshToken);
    await saveCredentials(db, service, refreshed);
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
  }

  return {
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
  };
}

export async function saveCredentials(
  db: Database,
  service: ServiceName,
  tokens: TokenResponse
): Promise<void> {
  await db
    .insert(oauthCredentials)
    .values({
      service,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    })
    .onConflictDoUpdate({
      target: oauthCredentials.service,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      },
    });
}

export async function deleteCredentials(
  db: Database,
  service: ServiceName
): Promise<void> {
  await db
    .delete(oauthCredentials)
    .where(eq(oauthCredentials.service, service));
}

export async function getConnectionStatus(
  db: Database
): Promise<Record<ServiceName, boolean>> {
  const creds = await db.select().from(oauthCredentials);
  const connected = new Set(creds.map((c) => c.service));
  return {
    gmail: connected.has("gmail"),
    github: connected.has("github"),
    todoist: connected.has("todoist"),
  };
}
