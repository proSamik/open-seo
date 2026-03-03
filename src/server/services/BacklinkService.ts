import {
  fetchBacklinksRaw,
  normalizeDomainInput,
} from "@/server/lib/dataforseo";
import { logServerError } from "@/server/lib/logger";
import { db } from "@/db";
import { backlinkResults } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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
  projectId: string;
  target: string;
  includeSubdomains: boolean;
  forceFetch?: boolean;
}): Promise<BacklinksResult> {
  const target = normalizeDomainInput(input.target, input.includeSubdomains);

  // --- Check Database Cache ---
  if (!input.forceFetch) {
    try {
      const cached = await db
        .select()
        .from(backlinkResults)
        .where(
          and(
            eq(backlinkResults.projectId, input.projectId),
            eq(backlinkResults.target, target),
            eq(backlinkResults.includeSubdomains, input.includeSubdomains)
          )
        )
        .limit(1)
        .get();

      if (cached) {
        return {
          target,
          hasData: cached.hasData,
          backlinks: JSON.parse(cached.resultsJson),
          fetchedAt: cached.fetchedAt,
        };
      }
    } catch (dbError) {
      // Log but continue to fetch if DB read fails
      logServerError("backlinks.db-read", dbError, { target, projectId: input.projectId });
    }
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

  // Persist to DB (fire-and-forget; don't block response)
  void (async () => {
    try {
      await db
        .insert(backlinkResults)
        .values({
          id: crypto.randomUUID(),
          projectId: input.projectId,
          target,
          includeSubdomains: input.includeSubdomains,
          resultsJson: JSON.stringify(backlinks),
          hasData: result.hasData,
          fetchedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: [
            backlinkResults.projectId,
            backlinkResults.target,
            backlinkResults.includeSubdomains,
          ],
          set: {
            resultsJson: JSON.stringify(backlinks),
            hasData: result.hasData,
            fetchedAt: nowIso,
          },
        });
    } catch (error) {
      logServerError("backlinks.db-write", error, { target, projectId: input.projectId });
    }
  })();

  return result;
}

export const BacklinkService = {
  getBacklinks,
} as const;
