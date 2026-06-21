import {
  USER_AGENT,
  buildArticleUrl,
  buildSearchUrl,
  clampLimit,
  isOriginAllowed,
  validateLang,
  validateTitle,
} from "../_shared/wiki-proxy.ts";

// CORS allowlist (spec §7): our web origins only, never "*".
const ALLOWED_ORIGINS = [
  Deno.env.get("PUBLIC_APP_URL") ?? "",
  "http://localhost:8081",
  "http://localhost:8099", // Playwright e2e port (matches playwright.config.ts)
].filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, if-none-match",
    Vary: "Origin",
  };
  if (isOriginAllowed(origin, ALLOWED_ORIGINS)) {
    headers["Access-Control-Allow-Origin"] = origin!;
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const UPSTREAM_HEADERS = {
  "User-Agent": USER_AGENT,
  "Api-User-Agent": USER_AGENT,
  Accept: "application/json",
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  const mode = url.searchParams.get("mode");

  if (!validateLang(lang)) {
    return json({ error: "invalid_input" }, 400, origin);
  }

  try {
    if (mode === "search") {
      const q = url.searchParams.get("q");
      if (!validateTitle(q)) {
        return json({ error: "invalid_input" }, 400, origin);
      }
      const limit = clampLimit(url.searchParams.get("limit"));
      const upstream = await fetch(buildSearchUrl(lang, q, limit), { headers: UPSTREAM_HEADERS });
      if (!upstream.ok) {
        return json({ error: "upstream_error" }, 502, origin);
      }
      const body = await upstream.text();
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          ...corsHeaders(origin),
        },
      });
    }

    // article mode
    const title = url.searchParams.get("title");
    if (!validateTitle(title)) {
      return json({ error: "invalid_input" }, 400, origin);
    }
    const ifNoneMatch = request.headers.get("If-None-Match");
    const upstream = await fetch(buildArticleUrl(lang, title), {
      headers: { ...UPSTREAM_HEADERS, ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) },
    });

    const etag = upstream.headers.get("ETag");
    if (upstream.status === 304) {
      return new Response(null, {
        status: 304,
        headers: { ...(etag ? { ETag: etag } : {}), ...corsHeaders(origin) },
      });
    }
    if (upstream.status === 404) {
      return json({ error: "not_found" }, 404, origin);
    }
    if (!upstream.ok) {
      return json({ error: "upstream_error" }, 502, origin);
    }
    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        ...(etag ? { ETag: etag } : {}),
        ...corsHeaders(origin),
      },
    });
  } catch (error) {
    console.error("wiki-proxy failed:", error);
    return json({ error: "upstream_error" }, 502, origin);
  }
});
