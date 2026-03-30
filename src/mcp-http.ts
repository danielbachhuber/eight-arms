import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-tools.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

export async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Known session — fast path
  if (sessionId && transports.has(sessionId)) {
    const start = Date.now();
    await transports.get(sessionId)!.handleRequest(req, res);
    console.log(`[mcp] reused session ${sessionId.slice(0, 8)}... (${Date.now() - start}ms)`);
    return;
  }

  // New or stale session
  if (req.method === "POST") {
    const start = Date.now();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
    console.log(`[mcp] new session (${Date.now() - start}ms)`);
    return;
  }

  if (req.method === "DELETE") {
    if (sessionId) transports.delete(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
