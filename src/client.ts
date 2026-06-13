export interface ApiCtx {
  apiKey: string;
  base: string;
}

export type ApiResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; message: string; type?: string };

/**
 * Thin proxy to the Solnk public API. Forwards the caller's API key verbatim —
 * key + scope validation happens on api.solnk.com, not here. Unwraps the
 * `{ data }` envelope on success and normalizes the `{ error }` envelope on failure.
 */
export async function callApi(
  ctx: ApiCtx,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<ApiResult> {
  // Discovery is allowed without a key (see index.ts), but any actual API call needs one.
  if (!ctx.apiKey) {
    return {
      ok: false,
      status: 401,
      message:
        "Missing Solnk API key. Configure your MCP client to send 'Authorization: Bearer sk_...' — create one at https://solnk.com/settings/api-keys.",
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.apiKey}`,
    Accept: "application/json",
    ...extraHeaders,
  };

  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${ctx.base}${path}`, { method, headers, body: payload });
  } catch (e) {
    return { ok: false, status: 0, message: `Network error reaching Solnk API: ${(e as Error).message}` };
  }

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const err = json?.error;
    return {
      ok: false,
      status: res.status,
      type: err?.type,
      message: err?.message || text || res.statusText,
    };
  }

  return { ok: true, data: json?.data !== undefined ? json.data : json };
}

/** Build a `?a=b&c=d` query string from defined values only. */
export function query(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
