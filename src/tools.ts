import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi, query, type ApiCtx, type ApiResult } from "./client";

const PLATFORM = z.enum([
  "x", "instagram", "tiktok", "youtube", "facebook",
  "linkedin", "pinterest", "threads", "bluesky",
]);

const TARGET = z.object({
  account_id: z.string().describe("Social account ID from solnk_list_accounts"),
  content: z.string().optional().describe("Per-platform copy; overrides the top-level content for this target"),
  media_ids: z.array(z.string()).optional().describe("Per-platform media override (IDs from solnk_create_media_from_url)"),
  platform_settings: z.record(z.string(), z.any()).optional()
    .describe("Flat per-platform options, e.g. pinterest {boardId,link}, youtube {privacyStatus,tags}. See developers.solnk.com."),
});

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(r: Extract<ApiResult, { ok: false }>) {
  const tag = r.type ? `${r.status} ${r.type}` : String(r.status);
  return { content: [{ type: "text" as const, text: `Solnk API error [${tag}]: ${r.message}` }], isError: true };
}
function send(r: ApiResult) {
  return r.ok ? ok(r.data) : fail(r);
}

export function registerTools(server: McpServer, ctx: ApiCtx): void {
  server.tool(
    "solnk_list_accounts",
    "List the user's connected social accounts (id, platform, username, status, capabilities). Call this first to get account_id values for publishing.",
    {
      platform: PLATFORM.optional(),
      status: z.enum(["active", "expired", "disabled"]).optional().describe("Defaults to all; only 'active' accounts can publish"),
    },
    async ({ platform, status }) => send(await callApi(ctx, "GET", `/accounts${query({ platform, status })}`)),
  );

  server.tool(
    "solnk_get_usage",
    "Get the user's plan limits and current usage. Check `can_publish` is true before publishing.",
    {},
    async () => send(await callApi(ctx, "GET", "/usage")),
  );

  server.tool(
    "solnk_publish",
    "Publish content to one or more platforms in a single request. Use publish_mode 'draft' to stage for review (then solnk_confirm_publish), 'scheduled' with scheduled_at, or 'immediate' to send now.",
    {
      content: z.string().optional().describe("Default copy for all targets; each target may override it"),
      publish_mode: z.enum(["immediate", "scheduled", "draft"]),
      scheduled_at: z.string().optional().describe("ISO 8601 UTC; required when publish_mode is 'scheduled'"),
      media_ids: z.array(z.string()).optional().describe("Default media for all targets"),
      targets: z.array(TARGET).min(1).describe("One entry per account to publish to"),
      idempotency_key: z.string().optional().describe("Reuse to retry safely; auto-generated if omitted"),
    },
    async ({ idempotency_key, ...body }) => {
      const key = idempotency_key || crypto.randomUUID();
      return send(await callApi(ctx, "POST", "/publishes", body, { "idempotency-key": key }));
    },
  );

  server.tool(
    "solnk_confirm_publish",
    "Confirm a draft publish so it goes out. Omit scheduled_at to publish immediately, or pass it to schedule.",
    {
      publish_id: z.string(),
      scheduled_at: z.string().optional().describe("ISO 8601 UTC; schedule instead of publishing now"),
    },
    async ({ publish_id, scheduled_at }) =>
      send(await callApi(ctx, "POST", `/publishes/${publish_id}/confirm`, scheduled_at ? { scheduled_at } : {})),
  );

  server.tool(
    "solnk_cancel_publish",
    "Cancel a draft or not-yet-sent scheduled publish. Cannot cancel one already processing or published.",
    { publish_id: z.string() },
    async ({ publish_id }) => send(await callApi(ctx, "DELETE", `/publishes/${publish_id}`)),
  );

  server.tool(
    "solnk_get_publish_status",
    "Get the aggregate status of a publish (draft/queued/processing/success/partial_success/failed/cancelled). For per-platform post URLs and engagement, use solnk_get_post_analytics.",
    { publish_id: z.string() },
    async ({ publish_id }) => send(await callApi(ctx, "GET", `/publishes/${publish_id}`)),
  );

  server.tool(
    "solnk_list_publishes",
    "List recent publishes with optional filters.",
    {
      status: z.string().optional(),
      platform: PLATFORM.optional(),
      account_id: z.string().optional(),
      created_after: z.string().optional().describe("ISO 8601 UTC"),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().max(100).optional(),
    },
    async (args) => send(await callApi(ctx, "GET", `/publishes${query(args)}`)),
  );

  server.tool(
    "solnk_get_post_analytics",
    "Get post performance. Without post_id: a list of posts with rolled-up metrics. With post_id: per-platform breakdown including each live platform_post_url and engagement.",
    {
      post_id: z.string().optional(),
      platform: PLATFORM.optional().describe("List mode only"),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().max(100).optional(),
    },
    async ({ post_id, platform, page, page_size }) =>
      send(await callApi(
        ctx, "GET",
        post_id ? `/analytics/posts/${post_id}` : `/analytics/posts${query({ platform, page, page_size })}`,
      )),
  );

  const MEDIA_CONTENT_TYPE = z.enum([
    "image/png", "image/jpeg", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/webm",
  ]);

  server.tool(
    "solnk_create_media_upload",
    "Upload a LOCAL image/video file in 3 steps: (1) call this to get a presigned `upload_url` + `media_id`; (2) HTTP PUT the raw file bytes to that `upload_url` with header `Content-Type` equal to the same content_type (URL expires in 15 min); (3) call solnk_confirm_media_upload with the media_id. Then pass media_id to solnk_publish. Use this when you have a local file on disk; use solnk_create_media_from_url when you already have a public URL. Limits: max 500 MB; types png/jpeg/webp/gif, mp4/mov/webm.",
    {
      filename: z.string().describe("Original filename, e.g. cover.png"),
      content_type: MEDIA_CONTENT_TYPE,
      size_bytes: z.number().int().positive().max(500 * 1024 * 1024).describe("File size in bytes (max 500 MB)"),
    },
    async ({ filename, content_type, size_bytes }) =>
      send(await callApi(ctx, "POST", "/media/uploads", { filename, content_type, size_bytes })),
  );

  server.tool(
    "solnk_confirm_media_upload",
    "Finalize a presigned upload after you've PUT the file to the upload_url from solnk_create_media_upload. Verifies the file is in storage and marks the media ready, returning the media_id to use in solnk_publish.",
    {
      media_id: z.string().describe("media_id returned by solnk_create_media_upload"),
    },
    async ({ media_id }) =>
      send(await callApi(ctx, "POST", `/media/uploads/${media_id}/confirm`)),
  );

  server.tool(
    "solnk_create_media_from_url",
    "Attach an image or video by public URL — Solnk fetches and stores it server-side, returning a media_id to use in solnk_publish. Limits: max 500 MB per file; allowed types png/jpeg/webp/gif, mp4/mov/webm. (For a local file on disk, use solnk_create_media_upload instead.)",
    {
      url: z.string().url().describe("Public URL of the image/video to ingest (max 500 MB)"),
      content_type: MEDIA_CONTENT_TYPE,
    },
    async ({ url, content_type }) => {
      const filename = url.split("/").pop()?.split("?")[0] || "media";
      const created = await callApi(ctx, "POST", "/media/uploads", {
        filename, content_type, source_url: url,
      });
      if (!created.ok) return fail(created);
      const mediaId = (created.data as { media_id?: string })?.media_id;
      if (!mediaId) return { content: [{ type: "text" as const, text: "Upload created but no media_id returned." }], isError: true };
      const confirmed = await callApi(ctx, "POST", `/media/uploads/${mediaId}/confirm`);
      if (!confirmed.ok) return fail(confirmed);
      return ok({ media_id: mediaId, ...(confirmed.data as object) });
    },
  );
}
