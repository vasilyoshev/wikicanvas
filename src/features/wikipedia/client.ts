import { appEnv } from "@/src/lib/env";

/** Builds the wiki-proxy URL (exported for tests). */
export function buildProxyUrl(params: {
  lang: string;
  title?: string;
  mode?: "search";
  q?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  search.set("lang", params.lang);
  if (params.mode === "search") {
    search.set("mode", "search");
    if (params.q !== undefined) search.set("q", params.q);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
  } else if (params.title !== undefined) {
    search.set("title", params.title);
  }
  return `${appEnv.supabaseUrl}/functions/v1/wiki-proxy?${search.toString()}`;
}
