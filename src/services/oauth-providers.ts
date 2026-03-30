import { z } from "zod";
import { eq } from "drizzle-orm";

export const oauthProviderSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  authUrl: z.string(),
  tokenUrl: z.string(),
  scopes: z.array(z.string()),
  redirectUri: z.string(),
});

export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

interface ProviderEndpoints {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

const PROVIDER_ENDPOINTS: Record<ServiceName, ProviderEndpoints> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:org", "notifications"],
  },
  todoist: {
    authUrl: "https://todoist.com/oauth/authorize",
    tokenUrl: "https://todoist.com/oauth/access_token",
    scopes: ["data:read_write"],
  },
};

export async function getProvider(service: ServiceName): Promise<OAuthProvider> {
  const baseRedirectUri = process.env.OAUTH_REDIRECT_BASE || "http://localhost:3210";
  const endpoints = PROVIDER_ENDPOINTS[service];

  // Try env vars first
  const envClientId = process.env[`${service.toUpperCase()}_CLIENT_ID`];
  const envClientSecret = process.env[`${service.toUpperCase()}_CLIENT_SECRET`];

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      ...endpoints,
      redirectUri: `${baseRedirectUri}/api/settings/oauth/${service}/callback`,
    };
  }

  // Fall back to DB
  const { oauthAppConfig } = await import("../db/schema/settings.js");
  const { db } = await import("../db/index.js");
  const [config] = await db
    .select()
    .from(oauthAppConfig)
    .where(eq(oauthAppConfig.service, service));

  if (!config) {
    throw new Error(`No OAuth app config for ${service}. Set client ID and secret in Settings.`);
  }

  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    ...endpoints,
    redirectUri: `${baseRedirectUri}/api/settings/oauth/${service}/callback`,
  };
}

export type ServiceName = "gmail" | "github" | "todoist";
export const ALL_SERVICES: ServiceName[] = ["gmail", "github", "todoist"];
