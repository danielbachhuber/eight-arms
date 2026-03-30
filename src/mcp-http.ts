import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-tools.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

export async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res);
    return;
  }

  // New session (must be POST with initialize)
  if (req.method === "POST") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    const server = createMcpServer();
    await server.connect(transport);

    // The session ID is assigned during handleRequest when it processes initialize
    await transport.handleRequest(req, res);

    // After handling, the transport should have a session ID
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
