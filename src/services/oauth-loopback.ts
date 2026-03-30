import http from "node:http";
import { URL } from "node:url";
import type { OAuthProvider } from "./oauth-providers.js";
import { exchangeCode, type TokenResponse } from "./oauth.js";

/**
 * Runs an OAuth loopback flow for "installed app" type clients.
 * Starts a temporary HTTP server on a random port, builds the auth URL
 * with http://localhost:<port> as the redirect URI, and waits for the
 * callback with the authorization code.
 *
 * Returns the auth URL to open in a browser, and a promise that resolves
 * with the token response once the user completes the flow.
 */
export function startLoopbackFlow(provider: OAuthProvider): {
  authUrl: string;
  port: number;
  tokenPromise: Promise<TokenResponse>;
} {
  let resolveToken: (token: TokenResponse) => void;
  let rejectToken: (err: Error) => void;

  const tokenPromise = new Promise<TokenResponse>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost`);

    if (url.pathname !== "/") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Authorization failed</h2><p>${error}</p><p>You can close this tab.</p></body></html>`);
      server.close();
      rejectToken(new Error(`OAuth error: ${error}`));
      return;
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Missing authorization code</h2><p>You can close this tab.</p></body></html>`);
      return;
    }

    try {
      // Exchange the code using the loopback redirect URI
      const loopbackRedirectUri = `http://localhost:${(server.address() as any).port}`;
      const loopbackProvider = { ...provider, redirectUri: loopbackRedirectUri };
      const tokens = await exchangeCode(loopbackProvider, code);

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Connected!</h2><p>You can close this tab and return to Eight Arms.</p></body></html>`);
      server.close();
      resolveToken(tokens);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Token exchange failed</h2><p>${err}</p></body></html>`);
      server.close();
      rejectToken(err instanceof Error ? err : new Error(String(err)));
    }
  });

  // Listen on random port
  server.listen(0, "127.0.0.1");
  const port = (server.address() as any).port;

  // Build auth URL with loopback redirect
  const loopbackRedirectUri = `http://localhost:${port}`;
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: loopbackRedirectUri,
    scope: provider.scopes.join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `${provider.authUrl}?${params.toString()}`;

  // Timeout after 5 minutes
  setTimeout(() => {
    server.close();
    rejectToken(new Error("OAuth loopback flow timed out (5 minutes)"));
  }, 5 * 60 * 1000);

  return { authUrl, port, tokenPromise };
}
