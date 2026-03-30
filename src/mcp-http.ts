import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-tools.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

export function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      transport.handleRequest(req, res);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    const mcpServer = createMcpServer();
    mcpServer.connect(transport).then(() => {
      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
      }
      transport.handleRequest(req, res);
    });

    return;
  }

  if (req.method === "GET") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      transport.handleRequest(req, res);
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No session" }));
    return;
  }

  if (req.method === "DELETE") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      transport.close();
      transports.delete(sessionId);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405);
  res.end();
}
