import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDigestTools } from "./tools/digests.js";
import { registerDigestResources } from "./resources/latest.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "robin-digest",
    version: "1.0.0",
  });

  registerDigestTools(server);
  registerDigestResources(server);

  return server;
}
