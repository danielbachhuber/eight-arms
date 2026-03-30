import type { OAuthProvider } from "./oauth-providers.js";

export function buildAuthUrl(provider: OAuthProvider, state: string): string {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scopes.join(" "),
    state,
    response_type: "code",
  });

  // Google requires these extra params for refresh tokens
  if (provider.authUrl.includes("google")) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  return `${provider.authUrl}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  scopes: string;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: provider.redirectUri,
    grant_type: "authorization_code",
  };

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return parseTokenResponse(data);
}

export async function refreshAccessToken(
  provider: OAuthProvider,
  refreshToken: string
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    ...parseTokenResponse(data),
    refreshToken: data.refresh_token || refreshToken,
  };
}

function parseTokenResponse(data: Record<string, unknown>): TokenResponse {
  const accessToken = data.access_token as string;
  const refreshToken = (data.refresh_token as string) || "";
  const expiresIn = data.expires_in as number | undefined;
  const scopes = (data.scope as string) || "";

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes,
  };
}
