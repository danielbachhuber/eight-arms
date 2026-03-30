import { z } from "zod";

export const oauthProviderSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  authUrl: z.string(),
  tokenUrl: z.string(),
  scopes: z.array(z.string()),
  redirectUri: z.string(),
});

export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

export function getProvider(service: "gmail" | "github" | "todoist"): OAuthProvider {
  const baseRedirectUri = process.env.OAUTH_REDIRECT_BASE || "http://localhost:3210";
  switch (service) {
    case "gmail":
      return {
        clientId: env("GMAIL_CLIENT_ID"),
        clientSecret: env("GMAIL_CLIENT_SECRET"),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.readonly",
        ],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/gmail/callback`,
      };
    case "github":
      return {
        clientId: env("GITHUB_CLIENT_ID"),
        clientSecret: env("GITHUB_CLIENT_SECRET"),
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: ["repo", "read:org", "notifications"],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/github/callback`,
      };
    case "todoist":
      return {
        clientId: env("TODOIST_CLIENT_ID"),
        clientSecret: env("TODOIST_CLIENT_SECRET"),
        authUrl: "https://todoist.com/oauth/authorize",
        tokenUrl: "https://todoist.com/oauth/access_token",
        scopes: ["data:read_write"],
        redirectUri: `${baseRedirectUri}/api/settings/oauth/todoist/callback`,
      };
  }
}

export type ServiceName = "gmail" | "github" | "todoist";
export const ALL_SERVICES: ServiceName[] = ["gmail", "github", "todoist"];
