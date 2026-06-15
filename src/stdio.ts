import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";

// stdio entrypoint — used by MCP directories and inspectors (e.g. Glama via
// `mcp-proxy`) to introspect the tool surface. Discovery (initialize /
// tools/list) needs no API key; a key is only required to actually invoke a
// tool, enforced per-call in callApi(). The production transport is Streamable
// HTTP on Cloudflare Workers (see index.ts) — this is purely a portable runner
// so the same tools can be served over stdio anywhere Node runs.
const apiKey = (process.env.SOLNK_API_KEY || "").trim();
const base = process.env.SOLNK_API_BASE || "https://api.solnk.com/api/v1";

async function main() {
  const server = new McpServer({ name: "solnk", version: "1.0.0" });
  registerTools(server, { apiKey, base });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
