# Solnk MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Solnk](https://solnk.com) — let any MCP client (Claude, Cursor, your own agent) **publish and schedule content across 9 social platforms** through one tool surface: **X, Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Threads, and Bluesky**.

It's a thin, stateless proxy to the [Solnk public API](https://developers.solnk.com): your API key is forwarded per request, and all auth/scope/quota enforcement happens server-side. No credentials are stored in this Worker.

## Hosted endpoint

A managed instance runs at:

```
https://mcp.solnk.com/mcp
```

Authenticate with a Solnk API key as a bearer token. Create one at **https://solnk.com/settings/api-keys**.

```
Authorization: Bearer sk_...
```

## Connect a client

Most MCP clients reach a remote HTTP server through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Example config (Claude Desktop / Cursor / any client using the standard `mcpServers` schema):

```json
{
  "mcpServers": {
    "solnk": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.solnk.com/mcp",
        "--header",
        "Authorization:Bearer ${SOLNK_API_KEY}"
      ],
      "env": {
        "SOLNK_API_KEY": "sk_your_key_here"
      }
    }
  }
}
```

Clients with native Streamable HTTP support can connect to `https://mcp.solnk.com/mcp` directly and set the `Authorization: Bearer sk_...` header.

## Tools

| Tool | What it does |
| --- | --- |
| `solnk_list_accounts` | List connected social accounts (id, platform, username, status, capabilities). Call first to get `account_id`s. |
| `solnk_get_usage` | Plan limits and current usage — check `can_publish` before posting. |
| `solnk_publish` | Publish to one or more platforms in a single request (`immediate`, `scheduled`, or `draft`). |
| `solnk_confirm_publish` | Confirm a draft so it goes out, now or scheduled. |
| `solnk_cancel_publish` | Cancel a draft or not-yet-sent scheduled publish. |
| `solnk_get_publish_status` | Aggregate status of a publish. |
| `solnk_list_publishes` | List recent publishes with filters. |
| `solnk_get_post_analytics` | Rolled-up or per-platform post metrics, including live post URLs. |
| `solnk_create_media_upload` | Presigned upload for a local image/video file (3-step flow). |
| `solnk_confirm_media_upload` | Finalize a presigned upload. |
| `solnk_create_media_from_url` | Ingest an image/video by public URL in one call. |

Full request/response shapes and per-platform options live at **[developers.solnk.com](https://developers.solnk.com)**.

## Self-hosting

The server is a single [Cloudflare Worker](https://workers.cloudflare.com/).

```bash
pnpm install

# Local dev — point at your own Solnk API base if needed
# (edit SOLNK_API_BASE in wrangler.toml, e.g. http://localhost:3002/api/v1)
pnpm dev

# Deploy to your own Cloudflare account
pnpm deploy
```

`wrangler.toml`:

- `SOLNK_API_BASE` — the Solnk public API the tools proxy to (defaults to `https://api.solnk.com/api/v1`).
- `routes` — bind your own custom domain.

No secrets are needed at deploy time; the API key is supplied by the client at request time.

## License

[MIT](./LICENSE) © Solnk
