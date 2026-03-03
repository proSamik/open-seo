import { useState, useEffect, useCallback } from "react";

type SortMode = "domainRank" | "pageRank" | "firstSeen";

export interface BacklinkSearchHistoryItem {
  domain: string;
  subdomains: boolean;
  sort: SortMode;
  search?: string;
  timestamp: number;
}

type AddBacklinkSearchInput = Omit<BacklinkSearchHistoryItem, "timestamp">;

const MAX_HISTORY = 20;

function storageKey(projectId: string) {
  return `backlink-search-history:${projectId}`;
}

function loadHistory(projectId: string): BacklinkSearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is BacklinkSearchHistoryItem =>
          item &&
          typeof item.domain === "string" &&
          typeof item.subdomains === "boolean" &&
          (item.sort === "domainRank" ||
            item.sort === "pageRank" ||
            item.sort === "firstSeen") &&
          (item.search === undefined || typeof item.search === "string") &&
          typeof item.timestamp === "number",
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(projectId: string, items: BacklinkSearchHistoryItem[]) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(items));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

function normalizeSearchText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isSameSearch(
  a: BacklinkSearchHistoryItem,
  b: AddBacklinkSearchInput,
): boolean {
  return (
    a.domain === b.domain &&
    a.subdomains === b.subdomains &&
    a.sort === b.sort &&
    normalizeSearchText(a.search) === normalizeSearchText(b.search)
  );
}

export function useBacklinkSearchHistory(projectId: string) {
  const [history, setHistory] = useState<BacklinkSearchHistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHistory(loadHistory(projectId));
    setIsLoaded(true);
  }, [projectId]);

  const addSearch = useCallback(
    (item: AddBacklinkSearchInput) => {
      setHistory((prev) => {
        const filtered = prev.filter(
          (existing) => !isSameSearch(existing, item),
        );
        const next = [
          {
            ...item,
            search: normalizeSearchText(item.search) || undefined,
            timestamp: Date.now(),
          },
          ...filtered,
        ].slice(0, MAX_HISTORY);
        saveHistory(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const removeHistoryItem = useCallback(
    (timestamp: number) => {
      setHistory((prev) => {
        const next = prev.filter((item) => item.timestamp !== timestamp);
        saveHistory(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory(projectId, []);
  }, [projectId]);

  return { history, isLoaded, addSearch, clearHistory, removeHistoryItem };
}
