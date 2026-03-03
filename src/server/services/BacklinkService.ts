import {
  fetchBacklinksRaw,
  normalizeDomainInput,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";
import { logServerError } from "@/server/lib/logger";

const BACKLINKS_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export type BacklinksResult = {
  target: string;
  hasData: boolean;
  backlinks: Array<{
    urlFrom: string | null;
    urlTo: string | null;
    anchor: string | null;
    domainFrom: string | null;
    domainFromRank: number | null;
    pageFromRank: number | null;
    dofollow: boolean | null;
    firstSeen: string | null;
  }>;
  fetchedAt: string;
};

async function getBacklinks(input: {
  target: string;
  includeSubdomains: boolean;
}): Promise<BacklinksResult> {
  const target = normalizeDomainInput(input.target, input.includeSubdomains);

  // --- KV cache check ---
  const cacheKey = buildCacheKey("backlinks", {
    target,
    includeSubdomains: input.includeSubdomains,
  });

  const cached = await getCached<BacklinksResult>(cacheKey);
  if (cached && cached.hasData) {
    return cached;
  }

  // --- Fetch fresh from DataForSEO ---
  const nowIso = new Date().toISOString();

  // Sort by domain rank by default for best backlinks
  const rawBacklinks = await fetchBacklinksRaw(target, 200, [
    "domain_from_rank,desc",
  ]);

  const backlinks = rawBacklinks.map((item) => ({
    urlFrom: item.url_from ?? null,
    urlTo: item.url_to ?? null,
    anchor: item.anchor ?? null,
    domainFrom: item.domain_from ?? null,
    domainFromRank: item.domain_from_rank ?? null,
    pageFromRank: item.page_from_rank ?? null,
    dofollow: item.dofollow ?? null,
    firstSeen: item.first_seen ?? null,
  }));

  const result: BacklinksResult = {
    target,
    hasData: backlinks.length > 0,
    backlinks,
    fetchedAt: nowIso,
  };

  // Persist to KV (fire-and-forget; don't block response)
  if (result.hasData) {
    void setCached(cacheKey, result, BACKLINKS_TTL_SECONDS).catch((error) => {
      logServerError("backlinks.cache-write", error, {
        target,
      });
    });
  }

  return result;
}

export const BacklinkService = {
  getBacklinks,
} as const;
