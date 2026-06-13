# Runs the Solnk MCP Worker locally (workerd/Miniflare via `wrangler dev`) so MCP
# directories and inspectors can build the repo and introspect the tool surface.
# No Cloudflare account or login is needed — this is a pure local dev server.
# MCP endpoint: http://<host>:8787/mcp  (discovery works without an API key;
# a Solnk API key is only needed to actually invoke a publishing tool.)
FROM node:20-slim

WORKDIR /app
ENV CI=true

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 8787
CMD ["pnpm", "exec", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]
