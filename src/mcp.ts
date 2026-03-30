import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-tools.js";

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
