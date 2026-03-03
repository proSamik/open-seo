import {
  DataforseoLabsApi,
  DataforseoLabsGoogleRelatedKeywordsLiveRequestInfo,
  DataforseoLabsGoogleKeywordSuggestionsLiveRequestInfo,
  DataforseoLabsGoogleKeywordIdeasLiveRequestInfo,
  DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo,
  DataforseoLabsGoogleRankedKeywordsLiveRequestInfo,
  DataforseoLabsGoogleHistoricalSerpsLiveRequestInfo,
  BacklinksApi,
  BacklinksBacklinksLiveRequestInfo,
} from "dataforseo-client";
import { env } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";

// ---------------------------------------------------------------------------
// SDK client factories (lazily created per-request using the env secret)
// ---------------------------------------------------------------------------

function createAuthenticatedFetch() {
  return (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const newInit: RequestInit = {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Basic ${env.DATAFORSEO_API_KEY}`,
      },
    };
    return fetch(url, newInit);
  };
}

const API_BASE = "https://api.dataforseo.com";

function getLabsApi() {
  return new DataforseoLabsApi(API_BASE, { fetch: createAuthenticatedFetch() });
}

function getBacklinksApi() {
  return new BacklinksApi(API_BASE, { fetch: createAuthenticatedFetch() });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the top-level response and first task both succeeded.
 * Throws a descriptive error on failure. Returns the first task.
 */
function assertOk<T extends { status_code?: number; status_message?: string }>(
  response: {
    status_code?: number;
    status_message?: string;
    tasks?: T[];
  } | null,
): T {
  if (!response) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an empty response",
    );
  }
  if (response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response.status_message || "DataForSEO request failed",
    );
  }
  const task = response.tasks?.[0];
  if (!task) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO response missing task");
  }
  if (task.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      task.status_message || "DataForSEO task failed",
    );
  }
  return task;
}

// ---------------------------------------------------------------------------
// DataForSEO Labs API wrappers
// ---------------------------------------------------------------------------

type RelatedKeywordItem = {
  keyword_data?: {
    keyword?: string;
    keyword_info?: {
      search_volume?: number | null;
      cpc?: number | null;
      competition?: number | null;
      monthly_searches?: Array<{
        year: number;
        month: number;
        search_volume: number | null;
      }> | null;
    };
    keyword_info_normalized_with_clickstream?: {
      search_volume?: number | null;
      monthly_searches?: Array<{
        year: number;
        month: number;
        search_volume: number | null;
      }> | null;
    };
    search_intent_info?: { main_intent?: string | null } | null;
    keyword_properties?: { keyword_difficulty?: number | null } | null;
  };
};

export async function fetchRelatedKeywordsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  depth: number = 3,
): Promise<RelatedKeywordItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleRelatedKeywordsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    depth,
    include_clickstream_data: true,
    include_serp_info: false,
  });

  const response = await api.googleRelatedKeywordsLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as RelatedKeywordItem[];
}

export type LabsKeywordDataItem = {
  keyword?: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | null;
    competition?: number | null;
    monthly_searches?: Array<{
      year: number;
      month: number;
      search_volume: number | null;
    }> | null;
  };
  keyword_info_normalized_with_clickstream?: {
    search_volume?: number | null;
    monthly_searches?: Array<{
      year: number;
      month: number;
      search_volume: number | null;
    }> | null;
  };
  search_intent_info?: { main_intent?: string | null } | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
};

export async function fetchKeywordSuggestionsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<LabsKeywordDataItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleKeywordSuggestionsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    include_clickstream_data: true,
    include_serp_info: false,
    include_seed_keyword: true,
    ignore_synonyms: false,
    exact_match: false,
  });

  const response = await api.googleKeywordSuggestionsLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as LabsKeywordDataItem[];
}

export async function fetchKeywordIdeasRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<LabsKeywordDataItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleKeywordIdeasLiveRequestInfo({
    keywords: [keyword],
    location_code: locationCode,
    language_code: languageCode,
    limit,
    include_clickstream_data: true,
    include_serp_info: false,
    ignore_synonyms: false,
    closely_variants: false,
  });

  const response = await api.googleKeywordIdeasLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as LabsKeywordDataItem[];
}

// ---------------------------------------------------------------------------
// Domain API wrappers
// ---------------------------------------------------------------------------

type DomainMetricsItem = {
  metrics?: Record<
    string,
    { etv?: number | null; count?: number | null } | undefined
  >;
};

export async function fetchDomainRankOverviewRaw(
  target: string,
  locationCode: number,
  languageCode: string,
): Promise<DomainMetricsItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit: 1,
  });

  const response = await api.googleDomainRankOverviewLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as DomainMetricsItem[];
}

export type DomainRankedKeywordItem = {
  keyword_data?: {
    keyword?: string | null;
    keyword_info?: {
      search_volume?: number | null;
      cpc?: number | null;
      keyword_difficulty?: number | null;
    } | null;
    keyword_properties?: {
      keyword_difficulty?: number | null;
    } | null;
  } | null;
  ranked_serp_element?: {
    serp_item?: {
      url?: string | null;
      relative_url?: string | null;
      rank_absolute?: number | null;
      etv?: number | null;
    } | null;
    url?: string | null;
    relative_url?: string | null;
    rank_absolute?: number | null;
    etv?: number | null;
  } | null;
  keyword?: string | null;
  rank_absolute?: number | null;
  etv?: number | null;
  keyword_difficulty?: number | null;
};

export async function fetchRankedKeywordsRaw(
  target: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  orderBy?: string[],
): Promise<DomainRankedKeywordItem[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleRankedKeywordsLiveRequestInfo({
    target,
    location_code: locationCode,
    language_code: languageCode,
    limit,
    order_by: orderBy,
  });

  const response = await api.googleRankedKeywordsLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as DomainRankedKeywordItem[];
}

// ---------------------------------------------------------------------------
// SERP Analysis API wrapper
// ---------------------------------------------------------------------------

type SerpSnapshotItem = {
  type?: string;
  rank_group?: number | null;
  rank_absolute?: number | null;
  domain?: string | null;
  title?: string | null;
  url?: string | null;
  description?: string | null;
  breadcrumb?: string | null;
  etv?: number | null;
  estimated_paid_traffic_cost?: number | null;
  backlinks_info?: {
    referring_domains?: number | null;
    backlinks?: number | null;
  } | null;
  rank_changes?: {
    previous_rank_absolute?: number | null;
    is_new?: boolean | null;
    is_up?: boolean | null;
    is_down?: boolean | null;
  } | null;
};

type SerpSnapshot = {
  se_results_count?: number | null;
  items_count?: number | null;
  items?: SerpSnapshotItem[];
};

export async function fetchHistoricalSerpsRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
): Promise<SerpSnapshot[]> {
  const api = getLabsApi();
  const req = new DataforseoLabsGoogleHistoricalSerpsLiveRequestInfo({
    keyword,
    location_code: locationCode,
    language_code: languageCode,
  });

  const response = await api.googleHistoricalSerpsLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as SerpSnapshot[];
}

// ---------------------------------------------------------------------------
// Domain utility functions (unchanged)
// ---------------------------------------------------------------------------

export function toRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return null;
  }
}

export function normalizeDomainInput(
  input: string,
  includeSubdomains: boolean,
): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "Domain is required");
  }

  const withProtocol = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const host = new URL(withProtocol).hostname.replace(/^www\./, "");

  if (includeSubdomains) {
    return host;
  }

  return toRootDomain(host);
}

function toRootDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const knownSecondLevel = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "co.jp",
  ]);
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  const lastThree = `${parts[parts.length - 3]}.${lastTwo}`;

  if (knownSecondLevel.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }

  return lastTwo;
}

// ---------------------------------------------------------------------------
// Backlinks API wrapper
// ---------------------------------------------------------------------------

export type BacklinksLiveItem = {
  url_from?: string | null;
  url_to?: string | null;
  anchor?: string | null;
  domain_from?: string | null;
  domain_from_rank?: number | null;
  page_from_rank?: number | null;
  dofollow?: boolean | null;
  first_seen?: string | null;
};

export async function fetchBacklinksRaw(
  target: string,
  limit: number,
  orderBy?: string[],
): Promise<BacklinksLiveItem[]> {
  const api = getBacklinksApi();
  const req = new BacklinksBacklinksLiveRequestInfo({
    target,
    limit,
    order_by: orderBy,
    include_subdomains: true,
  });

  const response = await api.backlinksLive([req]);
  const task = assertOk(response);

  const result = (task as { result?: Array<{ items?: unknown[] }> })
    .result?.[0];
  return (result?.items ?? []) as BacklinksLiveItem[];
}
