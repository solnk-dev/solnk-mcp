import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools";

export interface Env {
  SOLNK_API_BASE: string;
}

const MCP_ROUTE = "/mcp";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Human-readable landing so hitting the host in a browser isn't a 404.
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        name: "Solnk MCP",
        version: "1.0.0",
        endpoint: new URL(MCP_ROUTE, url.origin).toString(),
        auth: "Send 'Authorization: Bearer sk_...' (your Solnk API key) — get one at https://solnk.com/settings/api-keys",
        docs: "https://developers.solnk.com",
      });
    }

    if (url.pathname === MCP_ROUTE) {
      const apiKey = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!apiKey) {
        return json(
          { error: "Missing Solnk API key. Configure your MCP client to send 'Authorization: Bearer sk_...'." },
          401,
        );
      }
      // Stateless: a fresh server per request (MCP SDK guidance), key captured in tool closures.
      const server = new McpServer({ name: "solnk", version: "1.0.0" });
      registerTools(server, { apiKey, base: env.SOLNK_API_BASE });
      return createMcpHandler(server, { route: MCP_ROUTE })(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
