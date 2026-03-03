import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useEffect, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { sortBy } from "remeda";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";
import { Search, Globe, AlertCircle, Download, ChevronDown, Copy, History, Clock, X } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { toast } from "sonner";
import { useBacklinkSearchHistory } from "@/client/hooks/useBacklinkSearchHistory";

function csvEscape(value: string | number | null | undefined | boolean): string {
  if (value == null) return "";
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function backlinksToCsv(
  rows: Array<{
    urlFrom: string | null;
    urlTo: string | null;
    anchor: string | null;
    domainFrom: string | null;
    domainFromRank: number | null;
    pageFromRank: number | null;
    dofollow: boolean | null;
    firstSeen: string | null;
  }>
): string {
  const headers = [
    "Domain From",
    "URL From",
    "Anchor",
    "URL To",
    "Domain Rank",
    "Page Rank",
    "Dofollow",
    "First Seen",
  ];
  const lines = rows.map((row) =>
    [
      row.domainFrom,
      row.urlFrom,
      row.anchor,
      row.urlTo,
      row.domainFromRank,
      row.pageFromRank,
      row.dofollow,
      row.firstSeen ? new Date(row.firstSeen).toLocaleDateString() : null,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [headers.map(csvEscape).join(","), ...lines].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/p/$projectId/backlinks")({
  validateSearch: backlinksSearchSchema,
  component: BacklinksPage,
});

type BacklinksControlsValues = {
  domain: string;
  subdomains: boolean;
  sort: "domainRank" | "pageRank" | "firstSeen";
};

type SortMode = BacklinksControlsValues["sort"];
type SortOrder = "asc" | "desc";

function BacklinksPage() {
  const { projectId } = Route.useParams();

  // URL search params
  const {
    domain: domainInput = "",
    subdomains: includeSubdomains = true,
    sort: sortMode = "domainRank",
    order: sortOrder = "desc",
    search: searchText = "",
  } = Route.useSearch();
  
  const currentSortOrder = sortOrder as SortOrder;
  const navigate = useNavigate({ from: Route.fullPath });

  // Pending State
  const [domainError, setDomainError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState(searchText);

  const controlsForm = useForm({
    defaultValues: {
      domain: domainInput,
      subdomains: includeSubdomains,
      sort: sortMode,
    } as BacklinksControlsValues,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    clearHistory,
    removeHistoryItem,
  } = useBacklinkSearchHistory(projectId);

  // Sync back to pending
  useEffect(() => {
    controlsForm.setFieldValue("domain", domainInput);
    controlsForm.setFieldValue("subdomains", includeSubdomains);
    controlsForm.setFieldValue("sort", sortMode);
    setPendingSearch(searchText);
  }, [controlsForm, domainInput, includeSubdomains, searchText, sortMode]);

  const setSearchParams = useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  // Result state
  const [result, setResult] = useState<{
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
  } | null>(null);

  const backlinksMutation = useMutation({
    mutationFn: (data: {
      target: string;
      includeSubdomains: boolean;
    }) => getBacklinksOverview({ data }),
  });
  const isLoading = backlinksMutation.isPending;

  const filteredData = useMemo(() => {
    const source = result?.backlinks ?? [];
    const filtered = !pendingSearch
      ? source
      : source.filter((row) => {
          const haystack = `${row.urlFrom ?? ""} ${row.urlTo ?? ""} ${row.anchor ?? ""}`.toLowerCase();
          return haystack.includes(pendingSearch.toLowerCase().trim());
        });

    if (sortMode === "domainRank") {
      return sortBy(filtered, [(row) => row.domainFromRank ?? -1, currentSortOrder]);
    }
    if (sortMode === "pageRank") {
      return sortBy(filtered, [(row) => row.pageFromRank ?? -1, currentSortOrder]);
    }
    if (sortMode === "firstSeen") {
      return sortBy(filtered, [(row) => row.firstSeen ?? "", currentSortOrder]);
    }

    return filtered;
  }, [currentSortOrder, pendingSearch, result?.backlinks, sortMode]);

  const applySort = useCallback(
    (nextSort: SortMode, nextOrder: SortOrder) => {
      const vals = controlsForm.state.values;
      controlsForm.setFieldValue("sort", nextSort);
      setSearchParams({
        sort: nextSort,
        order: nextOrder,
        domain: vals.domain,
        subdomains: vals.subdomains ? undefined : vals.subdomains,
      });
    },
    [controlsForm, setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: SortMode) => {
      const nextOrder =
        nextSort === sortMode
          ? currentSortOrder === "asc"
            ? "desc"
            : "asc"
          : "desc";

      applySort(nextSort, nextOrder);
    },
    [applySort, currentSortOrder, sortMode],
  );

  const onSearch = () => {
    const values = controlsForm.state.values;
    const rawTarget = values.domain;
    if (!rawTarget.trim()) {
      setDomainError("Please enter a domain");
      return;
    }

    setDomainError(null);
    setOverviewError(null);
    
    // Update URL 
    setSearchParams({
      domain: rawTarget,
      subdomains: values.subdomains ? undefined : values.subdomains,
      sort: values.sort,
      order: currentSortOrder,
      search: pendingSearch.trim() || undefined,
    });

    backlinksMutation.mutate(
      {
        target: rawTarget,
        includeSubdomains: values.subdomains,
      },
      {
        onSuccess: (response) => {
          setResult(response);
          addSearch({
            domain: rawTarget,
            subdomains: values.subdomains,
            sort: values.sort,
            search: pendingSearch.trim() || undefined,
          });
        },
        onError: (error) => {
          setOverviewError(getStandardErrorMessage(error, "Lookup failed."));
        },
      }
    );
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto h-full flex flex-col">
      <div className="mx-auto max-w-7xl w-full space-y-4 flex-1">
        <div>
          <h1 className="text-2xl font-semibold">Backlinks Checker</h1>
          <p className="text-sm text-base-content/70">
            Analyze backlinks for any domain or URL. Sort by Authority and discover link building opportunities.
          </p>
        </div>

        <div className="card bg-base-100 border border-base-300 shrink-0">
          <div className="card-body gap-4">
            <form
              className="grid grid-cols-1 gap-3 lg:grid-cols-12"
              onSubmit={handleSearchSubmit}
            >
              <label
                className={`input input-bordered lg:col-span-8 flex items-center gap-2 ${domainError ? "input-error" : ""}`}
              >
                <Search className="size-4 text-base-content/60" />
                <controlsForm.Field name="domain">
                  {(field) => (
                    <input
                      placeholder="Enter a domain or URL (e.g. github.com)"
                      className="grow"
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                        if (domainError) setDomainError(null);
                      }}
                    />
                  )}
                </controlsForm.Field>
              </label>

              <controlsForm.Field name="sort">
                {(field) => (
                  <select
                    className="select select-bordered lg:col-span-2"
                    value={field.state.value}
                    onChange={(e) => {
                      const next = e.target.value as SortMode;
                      field.handleChange(next);
                      applySort(next, "desc");
                    }}
                  >
                    <option value="domainRank">By Domain Authority</option>
                    <option value="pageRank">By Page Authority</option>
                    <option value="firstSeen">By Most Recent</option>
                  </select>
                )}
              </controlsForm.Field>

              <button
                type="submit"
                className="btn btn-primary lg:col-span-2"
                disabled={isLoading}
              >
                {isLoading ? "Searching..." : "Search"}
              </button>
            </form>

            {domainError ? (
              <p className="text-sm text-error">{domainError}</p>
            ) : null}

            {overviewError ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{overviewError}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <label className="label cursor-pointer gap-2 py-0">
                <controlsForm.Field name="subdomains">
                  {(field) => (
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                  )}
                </controlsForm.Field>
                <span className="label-text">Include subdomains</span>
              </label>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        ) : result === null ? (
          <div className="space-y-4 pt-1 mt-4">
            {historyLoaded && history.length > 0 ? (
              <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="size-4 text-base-content/45" />
                    <span className="text-sm text-base-content/60">
                      {history.length} recent search
                      {history.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={clearHistory}
                  >
                    Clear all
                  </button>
                </div>

                <div className="grid gap-2">
                  {history.map((item) => (
                    <div
                      key={item.timestamp}
                      className="flex items-center justify-between p-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 transition-colors text-left group cursor-pointer"
                      onClick={() => {
                        const updates = {
                          domain: item.domain,
                          subdomains: item.subdomains ? undefined : false,
                          sort: item.sort,
                          order: undefined,
                          search: item.search?.trim() ? item.search : undefined,
                        };

                        controlsForm.setFieldValue("domain", item.domain);
                        controlsForm.setFieldValue(
                          "subdomains",
                          item.subdomains,
                        );
                        controlsForm.setFieldValue("sort", item.sort);
                        setPendingSearch(item.search ?? "");
                        setSearchParams(updates);

                        // Update URL
                        setSearchParams({
                          domain: item.domain,
                          subdomains: item.subdomains ? undefined : false,
                          sort: item.sort,
                          search: item.search?.trim() || undefined,
                        });

                        backlinksMutation.mutate(
                          {
                            target: item.domain,
                            includeSubdomains: item.subdomains,
                          },
                          {
                            onSuccess: (response) => {
                              setResult(response);
                              addSearch({
                                domain: item.domain,
                                subdomains: item.subdomains,
                                sort: item.sort,
                                search: item.search?.trim() || undefined,
                              });
                            },
                            onError: (error) => {
                              setOverviewError(
                                getStandardErrorMessage(error, "Lookup failed."),
                              );
                            },
                          },
                        );
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Clock className="size-4 text-base-content/40 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-base-content truncate">
                            {item.domain}
                          </p>
                          <p className="text-sm text-base-content/60 truncate">
                            {item.subdomains
                              ? "Include subdomains"
                              : "Root domain only"}
                            {item.search?.trim() ? ` - ${item.search}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-base-content/40">
                          {new Date(item.timestamp).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                        <button
                          className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeHistoryItem(item.timestamp);
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-12 text-center text-base-content/55 space-y-2">
                <Globe className="size-12 mx-auto opacity-30" />
                <p className="text-base font-medium text-base-content/80 mt-4">
                  Enter a domain to view its backlink profile
                </p>
              </section>
            )}
          </div>
        ) : !result.hasData || filteredData.length === 0 ? (
          <div className="alert alert-info mt-8">
            <span>No backlinks found for this search criteria.</span>
          </div>
        ) : (
          <div className="card bg-base-100 border border-base-300 mt-4 overflow-hidden flex-1 flex flex-col">
            <div className="flex items-center justify-end gap-2 p-4 border-b border-base-300 shrink-0 bg-base-100">
              <label className="input input-bordered input-sm flex-1 max-w-xs flex items-center gap-2">
                <Search className="size-4 text-base-content/60" />
                <input
                  placeholder="Filter by URL or anchor text"
                  value={pendingSearch}
                  onChange={(e) => {
                    setPendingSearch(e.target.value);
                    setSearchParams({ search: e.target.value.trim() || undefined });
                  }}
                />
              </label>
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-sm gap-1">
                  <Download className="size-4" />
                  Export
                  <ChevronDown className="size-3 opacity-60" />
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-48"
                >
                  <li>
                    <button
                      onClick={async () => {
                        const text = JSON.stringify(filteredData, null, 2);
                        await navigator.clipboard.writeText(text);
                        toast.success("Copied data");
                      }}
                    >
                      <Copy className="size-4" />
                      Copy JSON Array
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        const target = controlsForm.state.values.domain || "domain";
                        const rows = backlinksToCsv(filteredData);
                        downloadCsv(rows, `${target}-backlinks.csv`);
                        toast.success("Exported CSV");
                      }}
                    >
                      <Download className="size-4" />
                      Download CSV
                    </button>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="overflow-auto flex-1 h-[500px]">
              <table className="table table-zebra table-sm">
                <thead className="sticky top-0 bg-base-100 z-10 before:content-[''] before:absolute before:-bottom-[1px] before:left-0 before:right-0 before:h-[1px] before:bg-base-200">
                  <tr>
                    <th className="font-semibold px-4 w-72 min-w-72">Referring Page</th>
                    <th className="font-semibold max-w-[200px]">Anchor/Target URL</th>
                    <th 
                      className="font-semibold text-right cursor-pointer hover:bg-base-200 transition-colors"
                      onClick={() => handleSortColumnClick("domainRank")}
                    >
                      Domain Authority (DR) {sortMode === "domainRank" ? (currentSortOrder === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th 
                      className="font-semibold text-right cursor-pointer hover:bg-base-200 transition-colors"
                      onClick={() => handleSortColumnClick("pageRank")}
                    >
                      Page Rank {sortMode === "pageRank" ? (currentSortOrder === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="font-semibold text-center w-24">Type</th>
                    <th 
                      className="font-semibold cursor-pointer hover:bg-base-200 transition-colors w-32 whitespace-nowrap"
                      onClick={() => handleSortColumnClick("firstSeen")}
                    >
                      First Seen {sortMode === "firstSeen" ? (currentSortOrder === "asc" ? "↑" : "↓") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-base-200/50 group">
                      <td className="w-72 min-w-72 px-4 py-3 align-top">
                        <div className="flex flex-col gap-1 max-w-[280px]">
                          <span className="font-medium text-xs text-base-content/70 truncate" title={row.domainFrom || ""}>
                            {row.domainFrom}
                          </span>
                          <a 
                            href={row.urlFrom || "#"} 
                            target="_blank" 
                            rel="nofollow noreferrer"
                            className="text-sm text-primary hover:underline break-words line-clamp-2"
                            title={row.urlFrom || ""}
                          >
                            {row.urlFrom ? new URL(row.urlFrom).pathname : "N/A"}
                          </a>
                        </div>
                      </td>
                      <td className="max-w-[200px] py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="text-sm font-medium line-clamp-1 break-words" title={row.anchor || ""}>
                            {row.anchor || "(Image/No Text)"}
                          </div>
                          <div className="text-xs text-base-content/60 truncate" title={row.urlTo || ""}>
                            ↳ {row.urlTo ? new URL(row.urlTo).pathname : ""}
                          </div>
                        </div>
                      </td>
                      <td className="text-right align-top py-3 w-32">
                        <div className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-sm bg-base-200 text-base-content">
                          {row.domainFromRank ?? "-"}
                        </div>
                      </td>
                      <td className="text-right align-top py-3 w-32">
                        <span className="text-sm font-medium">{row.pageFromRank ?? "-"}</span>
                      </td>
                      <td className="text-center align-top py-3 w-24">
                        <span className={`badge badge-xs text-[10px] uppercase font-bold px-1.5 py-2 ${row.dofollow ? 'badge-success badge-outline' : 'badge-neutral badge-outline opacity-70'}`}>
                          {row.dofollow ? 'Dofollow' : 'Nofollow'}
                        </span>
                      </td>
                      <td className="text-xs text-base-content/60 align-top py-3 w-32 whitespace-nowrap">
                        {row.firstSeen ? new Date(row.firstSeen).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-base-200/50 border-t border-base-300 p-3 text-xs text-center text-base-content/60 shrink-0">
              Showing top {filteredData.length} backlinks matching your criteria.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
