"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RadarItem = {
  id: string;
  title: string;
  source: string;
  category: string;
  published_date: string;
  url: string;
  summary: string;
  lab_relevance: number;
  practicality: number;
  novelty: number;
  final_score: number;
  recommended_action: string;
  why_it_matters: string;
};

type RadarApiPayload = {
  data: RadarItem[];
  meta?: {
    generated_at?: string;
    total_rows?: number;
    unique_rows?: number;
    duplicate_rows_removed?: number;
    upsert_key?: string;
    last_collector_run?: string;
  };
};

type TriageStatus = "new" | "testing" | "watch" | "adopted" | "ignored";

function scoreClass(score: number) {
  if (score >= 7) return "bg-green-100 text-green-800";
  if (score >= 6) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function badgeClass(action: string) {
  if (action === "Test" || action === "testing") return "bg-green-100 text-green-800";
  if (action === "Watch" || action === "watch") return "bg-amber-100 text-amber-800";
  if (action === "adopted") return "bg-blue-100 text-blue-800";
  if (action === "ignored" || action === "Ignore") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

async function getRadarItems(): Promise<RadarApiPayload> {
  const url = process.env.NEXT_PUBLIC_RADAR_API_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_RADAR_API_URL in .env.local");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return { data };
  }
  if (Array.isArray(data?.data)) {
    return data as RadarApiPayload;
  }
  throw new Error("Webhook response shape is invalid");
}

function getItemKey(item: RadarItem) {
  return item.id || item.url || item.title;
}

function parseDate(value: string) {
  const ms = new Date(value || "").getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function timeAgo(value: string) {
  const ms = parseDate(value);
  if (!ms) return "unknown time";
  const diff = Date.now() - ms;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

export default function Home() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<RadarItem[]>([]);
  const [apiMeta, setApiMeta] = useState<RadarApiPayload["meta"]>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("all");
  const [action, setAction] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState("score");
  const [dateRange, setDateRange] = useState("all");
  const [onlyNewSinceVisit, setOnlyNewSinceVisit] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [triageMap, setTriageMap] = useState<Record<string, TriageStatus>>({});

  const loadItems = async () => {
    try {
      setLoading(true);
      setError("");
      const payload = await getRadarItems();
      setItems(payload.data || []);
      setApiMeta(payload.meta || {});
      setLastUpdated(new Date().toLocaleString());
      localStorage.setItem("radar-last-seen-at", String(Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const s = params.get("source");
    const c = params.get("category");
    const a = params.get("action");
    const min = params.get("min");
    const sort = params.get("sort");
    const date = params.get("date");
    const onlyNew = params.get("onlyNew");
    const view = params.get("view");
    const pSize = params.get("pageSize");
    if (q) setQuery(q);
    if (s) setSource(s);
    if (c) setCategory(c);
    if (a) setAction(a);
    if (min) setMinScore(Number(min));
    if (sort) setSortBy(sort);
    if (date) setDateRange(date);
    if (onlyNew) setOnlyNewSinceVisit(onlyNew === "1");
    if (view === "cards" || view === "table") setViewMode(view);
    if (pSize) setPageSize(Number(pSize));

    const savedSeen = Number(localStorage.getItem("radar-last-seen-at") || 0);
    if (savedSeen > 0) setLastSeenAt(savedSeen);

    const saved = localStorage.getItem("radar-triage-map");
    if (saved) setTriageMap(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("radar-triage-map", JSON.stringify(triageMap));
  }, [triageMap]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (source !== "all") params.set("source", source);
    if (category !== "all") params.set("category", category);
    if (action !== "all") params.set("action", action);
    if (minScore > 0) params.set("min", String(minScore));
    if (sortBy !== "score") params.set("sort", sortBy);
    if (dateRange !== "all") params.set("date", dateRange);
    if (onlyNewSinceVisit) params.set("onlyNew", "1");
    if (viewMode !== "table") params.set("view", viewMode);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const url = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", url);
  }, [query, source, category, action, minScore, sortBy, dateRange, onlyNewSinceVisit, viewMode, pageSize]);

  const sources = useMemo(
    () => ["all", ...new Set(items.map((i) => i.source).filter(Boolean))],
    [items],
  );
  const categories = useMemo(
    () => ["all", ...new Set(items.map((i) => i.category).filter(Boolean))],
    [items],
  );

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items
      .filter((item) => {
        const score = Number(item.final_score || 0);
        const publishedMs = parseDate(item.published_date);
        const now = Date.now();
        if (score < minScore) return false;
        if (source !== "all" && item.source !== source) return false;
        if (category !== "all" && item.category !== category) return false;
        if (action !== "all" && item.recommended_action !== action) return false;
        if (dateRange === "7d" && now - publishedMs > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateRange === "30d" && now - publishedMs > 30 * 24 * 60 * 60 * 1000) return false;
        if (onlyNewSinceVisit && lastSeenAt > 0 && publishedMs <= lastSeenAt) return false;
        if (!text) return true;
        const haystack = `${item.title} ${item.summary} ${item.why_it_matters}`.toLowerCase();
        return haystack.includes(text);
      })
      .sort((a, b) => {
        if (sortBy === "latest") {
          return (
            new Date(b.published_date || 0).getTime() -
            new Date(a.published_date || 0).getTime()
          );
        }
        return Number(b.final_score || 0) - Number(a.final_score || 0);
      });
  }, [items, query, source, category, action, minScore, sortBy, dateRange, onlyNewSinceVisit, lastSeenAt]);

  const top = filtered[0];
  const avgScore = filtered.length
    ? (
        filtered.reduce((sum, item) => sum + Number(item.final_score || 0), 0) /
        filtered.length
      ).toFixed(2)
    : "0.00";

  const testingItems = filtered.filter(
    (x) => triageMap[getItemKey(x)] === "testing" || x.recommended_action === "Test",
  );
  const watchItems = filtered.filter(
    (x) => triageMap[getItemKey(x)] === "watch" || x.recommended_action === "Watch",
  );
  const newItems = filtered.filter((x) => !triageMap[getItemKey(x)]);

  const setTriage = (item: RadarItem, status: TriageStatus) => {
    setTriageMap((prev) => ({ ...prev, [getItemKey(item)]: status }));
  };

  const resetFilters = () => {
    setQuery("");
    setSource("all");
    setCategory("all");
    setAction("all");
    setMinScore(0);
    setSortBy("score");
    setDateRange("all");
    setOnlyNewSinceVisit(false);
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [query, source, category, action, minScore, sortBy, dateRange, onlyNewSinceVisit, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const downloadCsv = () => {
    const headers = [
      "title",
      "source",
      "category",
      "recommended_action",
      "triage_status",
      "final_score",
      "published_date",
      "url",
      "summary",
      "why_it_matters",
    ];
    const rows = filtered.map((item) => [
      item.title,
      item.source,
      item.category,
      item.recommended_action,
      triageMap[getItemKey(item)] || "",
      String(item.final_score ?? ""),
      item.published_date,
      item.url,
      item.summary,
      item.why_it_matters,
    ]);
    const escapeCsv = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `ai-tool-radar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const sourceMetrics = useMemo(() => {
    const grouped: Record<string, { count: number; avgScore: number; testRate: number }> = {};
    const bySource: Record<string, RadarItem[]> = {};
    for (const item of filtered) {
      const key = item.source || "Unknown";
      bySource[key] = bySource[key] || [];
      bySource[key].push(item);
    }
    for (const [key, list] of Object.entries(bySource)) {
      const count = list.length;
      const avgScore =
        list.reduce((sum, i) => sum + Number(i.final_score || 0), 0) / Math.max(1, count);
      const tests = list.filter((i) => i.recommended_action === "Test").length;
      grouped[key] = { count, avgScore, testRate: (tests / Math.max(1, count)) * 100 };
    }
    return Object.entries(grouped).sort((a, b) => b[1].count - a[1].count);
  }, [filtered]);

  const scoreTrend = useMemo(() => {
    const byDay = new Map<string, { total: number; count: number }>();
    for (const item of filtered) {
      const ms = parseDate(item.published_date);
      if (!ms) continue;
      const day = new Date(ms).toISOString().slice(0, 10);
      const current = byDay.get(day) || { total: 0, count: 0 };
      current.total += Number(item.final_score || 0);
      current.count += 1;
      byDay.set(day, current);
    }

    const points = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, stats]) => ({
        day,
        avg: stats.total / Math.max(1, stats.count),
      }));

    if (points.length < 2) return "";

    const min = Math.min(...points.map((p) => p.avg));
    const max = Math.max(...points.map((p) => p.avg));
    const range = Math.max(0.1, max - min);

    return points
      .map((p, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 100 - ((p.avg - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [filtered]);

  const health = loading ? "syncing" : error ? "degraded" : "healthy";

  const latestByDate = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => parseDate(b.published_date) - parseDate(a.published_date),
      ),
    [filtered],
  );

  const isFrontPage = source === "all";

  /** Cross-feed “wire”: newest items with real URLs (not filtered by section). */
  const wireItems = useMemo(
    () =>
      [...items]
        .filter((i) => i.url && /^https?:\/\//i.test(String(i.url).trim()))
        .sort((a, b) => parseDate(b.published_date) - parseDate(a.published_date))
        .slice(0, 24),
    [items],
  );

  const topStories = useMemo(() => [...filtered].slice(0, 6), [filtered]);
  const trendingNow = useMemo(
    () => [...filtered].filter((x) => Number(x.final_score || 0) >= 7).slice(0, 8),
    [filtered],
  );
  const latestTools = useMemo(
    () =>
      latestByDate
        .filter((x) => x.source === "ProductHunt" || x.source === "GitHub")
        .slice(0, 8),
    [latestByDate],
  );
  /** Front-page research column: arXiv papers only (no HN / Medium mixed in). */
  const latestArxivPapers = useMemo(
    () => latestByDate.filter((x) => x.source === "arXiv").slice(0, 8),
    [latestByDate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (isTypingTarget) return;

      const key = event.key.toLowerCase();
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (key === "n") {
        setOnlyNewSinceVisit((prev) => !prev);
      } else if (key === "t") {
        setAction("Test");
      } else if (key === "w") {
        setAction("Watch");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const editionDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const streamSectionTitle =
    source === "all"
      ? "Front page · headlines"
      : source === "ProductHunt"
        ? "Product Hunt · top items"
        : source === "GitHub"
          ? "GitHub · top repositories"
          : source === "arXiv"
            ? "Research · arXiv papers"
            : "News & links · Hacker News";

  const archiveSectionTitle =
    source === "all"
      ? "Archive · all ranked items"
      : `Archive · ${source === "ProductHunt" ? "Product Hunt" : source === "HackerNews" ? "Hacker News" : source}`;

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      {/* Utility rail */}
      <div className="border-b border-stone-300 bg-stone-900 text-[11px] text-stone-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <span className="uppercase tracking-widest text-stone-400">Edition</span>
          <span className="text-stone-100">{editionDate}</span>
          <span className="hidden sm:inline">·</span>
          <span>Updated {lastUpdated || "—"}</span>
          <span className="hidden md:inline">·</span>
          <span>
            Feed status:{" "}
            <span
              className={
                health === "healthy"
                  ? "text-emerald-400"
                  : health === "degraded"
                    ? "text-red-400"
                    : "text-amber-300"
              }
            >
              {health}
            </span>
          </span>
          <button
            type="button"
            onClick={loadItems}
            className="ml-auto rounded border border-stone-600 bg-stone-800 px-2 py-0.5 text-stone-100 hover:bg-stone-700"
          >
            Refresh edition
          </button>
        </div>
      </div>

      {/* Masthead */}
      <header className="border-b border-stone-300 bg-[var(--paper-card)]">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-4 text-center sm:px-6 sm:pt-7 sm:pb-5">
          <div className="rule-thick mx-auto mb-3 max-w-xs sm:max-w-sm" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500">
            Artificial intelligence · tools · research · signals
          </p>
          <h1 className="font-headline mt-2 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            AI Tool Radar
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-stone-600 sm:text-sm">
            A daily news desk for the latest AI tools, papers, and trending stories — curated and scored for your lab.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-stone-500 sm:text-xs">
            <span>Collector: {apiMeta?.last_collector_run ? new Date(apiMeta.last_collector_run).toLocaleString() : "—"}</span>
            <span>·</span>
            <span>Stories: {apiMeta?.unique_rows ?? filtered.length}</span>
            {apiMeta?.duplicate_rows_removed != null ? (
              <>
                <span>·</span>
                <span>Dedup: {apiMeta.duplicate_rows_removed}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Section nav — newspaper-style */}
        <nav className="border-t border-stone-200 bg-stone-100/90">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-0.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-700 sm:gap-2 sm:py-2 sm:text-xs">
            <span className="px-2 py-1 text-stone-500">Sections</span>
            <button
              type="button"
              onClick={() => {
                resetFilters();
                setSource("all");
                setCategory("all");
                setPage(1);
              }}
              className={`rounded px-2 py-1 hover:bg-white hover:shadow-sm ${
                isFrontPage ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : ""
              }`}
            >
              Front page
            </button>
            <button
              type="button"
              onClick={() => {
                setSource("ProductHunt");
                setCategory("all");
                setPage(1);
              }}
              className={`rounded px-2 py-1 hover:bg-white hover:shadow-sm ${
                source === "ProductHunt" ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : ""
              }`}
            >
              Product Hunt
            </button>
            <button
              type="button"
              onClick={() => {
                setSource("GitHub");
                setCategory("all");
                setPage(1);
              }}
              className={`rounded px-2 py-1 hover:bg-white hover:shadow-sm ${
                source === "GitHub" ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : ""
              }`}
            >
              GitHub
            </button>
            <button
              type="button"
              onClick={() => {
                setSource("arXiv");
                setCategory("all");
                setPage(1);
              }}
              className={`rounded px-2 py-1 hover:bg-white hover:shadow-sm ${
                source === "arXiv" ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : ""
              }`}
            >
              Research
            </button>
            <button
              type="button"
              onClick={() => {
                setSource("HackerNews");
                setCategory("all");
                setPage(1);
              }}
              className={`rounded px-2 py-1 hover:bg-white hover:shadow-sm ${
                source === "HackerNews" ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : ""
              }`}
            >
              News & links
            </button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-6">
        {/* Dateline stats */}
        <section className="mb-6 grid gap-px overflow-hidden rounded-sm border border-stone-300 bg-stone-300 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-[var(--paper-card)] p-3 sm:p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">In this edition</p>
            <p className="font-headline mt-0.5 text-2xl font-bold tabular-nums text-stone-900">{filtered.length}</p>
          </div>
          <div className="bg-[var(--paper-card)] p-3 sm:p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Avg signal</p>
            <p className="font-headline mt-0.5 text-2xl font-bold tabular-nums text-stone-900">{avgScore}</p>
          </div>
          <div className="bg-[var(--paper-card)] p-3 sm:p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">To test</p>
            <p className="font-headline mt-0.5 text-2xl font-bold tabular-nums text-stone-900">{testingItems.length}</p>
          </div>
          <div className="bg-[var(--paper-card)] p-3 sm:p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">To watch</p>
            <p className="font-headline mt-0.5 text-2xl font-bold tabular-nums text-stone-900">{watchItems.length}</p>
          </div>
        </section>

        <section className="mb-6 border border-stone-300 bg-[var(--paper-card)] p-3 shadow-sm sm:p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Search & filters
          </p>
          <div className="grid gap-3 md:grid-cols-6">
            <input
              ref={searchRef}
              className="rounded-sm border border-stone-300 bg-stone-50 px-3 py-2 text-sm md:col-span-2"
              placeholder="Search headlines, summaries…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isFrontPage ? (
              <select
                className="rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
              >
                {sources.map((s) => (
                  <option key={s} value={s}>
                    Source: {s}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center text-sm">
                <span className="rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-stone-800">
                  {source}
                </span>
              </div>
            )}
            <select
              className="rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
            <select
              className="rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="all">Action: all</option>
              <option value="Test">Action: Test</option>
              <option value="Watch">Action: Watch</option>
              <option value="Ignore">Action: Ignore</option>
            </select>
            <select
              className="rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="score">Sort: score</option>
              <option value="latest">Sort: latest</option>
            </select>
            <select
              className="rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="all">Date: all</option>
              <option value="7d">Date: 7 days</option>
              <option value="30d">Date: 30 days</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-200 pt-4 text-sm">
            <label htmlFor="min-score" className="text-stone-600">
              Min score: {minScore}
            </label>
            <input
              id="min-score"
              type="range"
              min={0}
              max={10}
              step={1}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="accent-[var(--accent)]"
            />
            <button
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              className="rounded-sm border border-stone-400 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                viewMode === "table"
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-stone-100 text-stone-700"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                viewMode === "cards"
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-stone-100 text-stone-700"
              }`}
            >
              Cards
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-stone-700">
              <input
                type="checkbox"
                checked={onlyNewSinceVisit}
                onChange={(e) => setOnlyNewSinceVisit(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Only new since last visit
            </label>
            <span className="text-xs text-stone-500">
              Shortcuts: `/` search · `n` new · `t` Test · `w` Watch
            </span>
          </div>
        </section>

        <section className="mb-6 grid gap-px overflow-hidden border border-stone-300 bg-stone-300 lg:grid-cols-3">
          <article className="rule-thick relative bg-[var(--paper-card)] p-4 sm:p-5 lg:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Lead story
            </p>
            {top ? (
              <>
                <h2 className="font-headline mt-2 text-2xl font-bold leading-snug tracking-tight text-stone-900 sm:text-[1.65rem] sm:leading-tight">
                  {top.url ? (
                    <a
                      href={top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                    >
                      {top.title}
                    </a>
                  ) : (
                    top.title
                  )}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">
                  {top.source}
                  <span className="mx-2 text-stone-300">·</span>
                  {timeAgo(top.published_date)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-stone-700 sm:text-[15px]">{top.summary}</p>
                <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-xs italic leading-relaxed text-stone-600 sm:text-sm">
                  {top.why_it_matters}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-sm border border-stone-200 px-2 py-0.5 ${scoreClass(Number(top.final_score || 0))}`}>
                    Score {top.final_score}
                  </span>
                  <span className="rounded-sm border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-800">
                    {top.category || "unknown"}
                  </span>
                  <span className={`rounded-sm border border-stone-200 px-2 py-0.5 ${badgeClass(top.recommended_action)}`}>
                    {top.recommended_action}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {top.url ? (
                    <a
                      href={top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                    >
                      Full article
                    </a>
                  ) : null}
                  <button
                    onClick={() => setTriage(top, "testing")}
                    className="rounded-sm border border-green-700 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100"
                  >
                    Move to testing
                  </button>
                  <button
                    onClick={() => setTriage(top, "watch")}
                    className="rounded-sm border border-amber-700 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Move to watch
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-stone-500">No lead story for the current filters.</p>
            )}
          </article>

          <aside className="bg-[var(--paper-card)] p-4 sm:p-4">
            <h3 className="border-b border-stone-200 pb-1.5 font-headline text-xs font-bold uppercase tracking-wide text-stone-800">
              Trending
            </h3>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-500">
              By signal strength
            </p>
            <div className="mt-3 space-y-0 divide-y divide-stone-200">
              {trendingNow.slice(0, 6).map((item) => (
                <div key={getItemKey(item)} className="py-2.5 first:pt-0">
                  <p className="text-[13px] font-semibold leading-snug text-stone-900">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                    <span className={`rounded-sm px-1.5 py-0.5 ${scoreClass(Number(item.final_score || 0))}`}>
                      {item.final_score}
                    </span>
                    <span>{item.source}</span>
                    <span>{timeAgo(item.published_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        {isFrontPage ? (
        <section className="mb-6 grid gap-px overflow-hidden border border-stone-300 bg-stone-300 sm:grid-cols-3">
          <div className="bg-[var(--paper-card)] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Desk · New</h3>
            <p className="font-headline mt-1 text-2xl font-bold text-stone-900">{newItems.length}</p>
            <p className="mt-1 text-xs text-stone-500">Untriaged candidates</p>
          </div>
          <div className="bg-[var(--paper-card)] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Desk · Testing</h3>
            <p className="font-headline mt-1 text-2xl font-bold text-stone-900">{testingItems.length}</p>
            <p className="mt-1 text-xs text-stone-500">In evaluation</p>
          </div>
          <div className="bg-[var(--paper-card)] p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Desk · Watchlist</h3>
            <p className="font-headline mt-1 text-2xl font-bold text-stone-900">{watchItems.length}</p>
            <p className="mt-1 text-xs text-stone-500">On your radar</p>
          </div>
        </section>
        ) : null}

        {isFrontPage ? (
        <section className="mb-6 grid gap-px overflow-hidden border border-stone-300 bg-stone-300 lg:grid-cols-2">
          <div className="bg-[var(--paper-card)] p-4 sm:p-4">
            <div className="rule-thin mb-2" />
            <h3 className="font-headline text-base font-bold text-stone-900 sm:text-lg">Tools & launches</h3>
            <p className="mt-1 text-xs text-stone-500">Product Hunt, GitHub, and shipped tools</p>
            <div className="mt-4 space-y-0 divide-y divide-stone-200">
              {latestTools.map((item) => (
                <article key={getItemKey(item)} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-headline text-sm font-semibold text-stone-900">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </h4>
                    <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs ${scoreClass(Number(item.final_score || 0))}`}>
                      {item.final_score}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">{item.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                    <span>{item.source}</span>
                    <span>{timeAgo(item.published_date)}</span>
                    <span className={`rounded-sm px-1.5 py-0.5 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="bg-[var(--paper-card)] p-4 sm:p-4">
            <div className="rule-thin mb-2" />
            <h3 className="font-headline text-base font-bold text-stone-900 sm:text-lg">Research papers</h3>
            <p className="mt-1 text-xs text-stone-500">arXiv only — open any title for the canonical paper link</p>
            <div className="mt-4 space-y-0 divide-y divide-stone-200">
              {latestArxivPapers.map((item) => (
                <article key={getItemKey(item)} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-headline text-sm font-semibold text-stone-900">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </h4>
                    <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs ${scoreClass(Number(item.final_score || 0))}`}>
                      {item.final_score}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">{item.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                    <span>{item.source}</span>
                    <span>{timeAgo(item.published_date)}</span>
                    <span className={`rounded-sm px-1.5 py-0.5 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        ) : null}

        <section className="mb-6 border border-stone-300 bg-[var(--paper-card)] p-4 shadow-sm sm:p-4">
          <h3 className="font-headline text-base font-bold text-stone-900 sm:text-lg">{streamSectionTitle}</h3>
          <p className="mt-1 text-xs text-stone-500">
            {isFrontPage
              ? "Highest-ranked items across all sources — each card opens the original URL."
              : "Top items in this feed only — click a headline to open the source."}
          </p>
          <div className="mt-3 grid gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-3">
            {topStories.map((item) => (
              <a
                key={getItemKey(item)}
                href={item.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[var(--paper-card)] p-3 transition hover:bg-stone-50 sm:p-3.5"
              >
                <p className="text-[13px] font-semibold leading-snug text-stone-900">{item.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                  <span>{item.source}</span>
                  <span>{timeAgo(item.published_date)}</span>
                  <span className={`rounded-sm px-1.5 py-0.5 ${scoreClass(Number(item.final_score || 0))}`}>
                    {item.final_score}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {isFrontPage ? (
        <section className="mb-6 border border-stone-300 bg-[var(--paper-card)] shadow-sm">
          <div className="border-b border-stone-200 px-3 py-3 sm:px-4">
            <h3 className="font-headline text-base font-bold text-stone-900">Source desk</h3>
            <p className="mt-0.5 text-[11px] text-stone-500 sm:text-xs">Volume and average score by feed</p>
          </div>
          <div className="border-b border-stone-200 px-3 py-3 sm:px-4">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Score trend · 14 days
            </p>
            {scoreTrend ? (
              <svg viewBox="0 0 100 100" className="h-20 w-full text-[var(--accent)]">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  points={scoreTrend}
                />
              </svg>
            ) : (
              <p className="text-xs text-stone-500">Not enough dated points to render trend.</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Source</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Items</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Avg</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Test %</th>
                </tr>
              </thead>
              <tbody>
                {sourceMetrics.map(([name, metric]) => (
                  <tr key={name} className="border-t border-stone-100">
                    <td className="px-3 py-2 font-medium text-stone-800">{name}</td>
                    <td className="px-3 py-2 tabular-nums text-stone-700">{metric.count}</td>
                    <td className="px-3 py-2 tabular-nums text-stone-700">{metric.avgScore.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums text-stone-700">{metric.testRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
          <div className="border-b border-stone-200 px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-headline text-base font-bold text-stone-900">{archiveSectionTitle}</h3>
                <p className="mt-0.5 text-[11px] text-stone-500 sm:text-xs">Sort, triage, and open sources</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="page-size" className="text-stone-500">
                  Rows
                </label>
                <select
                  id="page-size"
                  className="rounded-sm border border-stone-300 bg-white px-2 py-1 text-xs"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
          <div className="divide-y divide-stone-200">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                Loading edition from webhook…
              </div>
            ) : error ? (
              <div className="px-4 py-6">
                <p className="text-sm text-red-700">Could not load data: {error}</p>
                <button
                  onClick={loadItems}
                  className="mt-2 rounded-sm border border-stone-400 bg-white px-3 py-1.5 text-xs text-stone-800 hover:bg-stone-50"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-stone-500">
                No rows returned. Check your n8n run and sheet.
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6">
                <p className="text-sm text-stone-600">Nothing matches these filters.</p>
                <button
                  onClick={resetFilters}
                  className="mt-2 rounded-sm border border-stone-400 bg-white px-3 py-1.5 text-xs text-stone-800 hover:bg-stone-50"
                >
                  Reset filters
                </button>
              </div>
            ) : viewMode === "cards" ? (
              paginated.map((item) => (
                <article key={item.id || item.url} className="border-b border-stone-100 px-4 py-3 last:border-b-0 sm:px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold leading-snug text-stone-900">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </h4>
                      <p className="mt-1 text-xs text-stone-600 line-clamp-2">{item.summary}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-stone-500 line-clamp-2">{item.why_it_matters}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-sm border border-stone-200 px-2 py-0.5 text-xs ${scoreClass(
                        Number(item.final_score || 0),
                      )}`}
                    >
                      {item.final_score}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-sm border border-stone-200 bg-stone-50 px-2 py-1 text-stone-800">
                      {item.category || "unknown"}
                    </span>
                    <span className={`rounded-sm border border-stone-200 px-2 py-1 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                    {triageMap[getItemKey(item)] ? (
                      <span className={`rounded-sm border border-stone-200 px-2 py-1 ${badgeClass(triageMap[getItemKey(item)])}`}>
                        {triageMap[getItemKey(item)]}
                      </span>
                    ) : null}
                    <span className="text-stone-500">{item.source}</span>
                    <span className="text-stone-400">{item.published_date}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setTriage(item, "testing")}
                      className="rounded-sm border border-green-700 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-900"
                    >
                      Testing
                    </button>
                    <button
                      onClick={() => setTriage(item, "watch")}
                      className="rounded-sm border border-amber-700 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
                    >
                      Watch
                    </button>
                    <button
                      onClick={() => setTriage(item, "adopted")}
                      className="rounded-sm border border-blue-800 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900"
                    >
                      Adopted
                    </button>
                    <button
                      onClick={() => setTriage(item, "ignored")}
                      className="rounded-sm border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-800"
                    >
                      Ignore
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="overflow-x-auto">
                <table className="archive-table w-full min-w-[640px] table-fixed border-collapse text-left text-stone-800">
                  <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="w-[38%] py-2 pl-3 pr-2 text-left">Title</th>
                      <th className="w-[11%] py-2 px-2 text-left">Source</th>
                      <th className="w-[12%] py-2 px-2 text-left">Category</th>
                      <th className="w-[10%] py-2 px-2 text-left">Action</th>
                      <th className="w-[11%] py-2 px-2 text-left">Triage</th>
                      <th className="w-[7%] py-2 px-2 text-left">Score</th>
                      <th className="w-[11%] py-2 px-2 text-left">Published</th>
                      <th className="w-0 py-2 pr-3 pl-2 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {paginated.map((item) => (
                      <tr key={item.id || item.url} className="align-top hover:bg-stone-50/80">
                        <td className="min-w-0 py-2 pl-3 pr-2">
                          <div className="min-w-0">
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="line-clamp-2 font-medium text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                              >
                                {item.title}
                              </a>
                            ) : (
                              <span className="line-clamp-2 font-medium text-stone-900">{item.title}</span>
                            )}
                            {item.summary ? (
                              <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-stone-500">{item.summary}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-[11px] text-stone-600">{item.source}</td>
                        <td className="py-2 px-2">
                          <span className="inline-block max-w-full truncate rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-800">
                            {item.category || "—"}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`inline-block max-w-full truncate rounded border border-stone-200 px-1.5 py-0.5 text-[11px] ${badgeClass(item.recommended_action)}`}
                          >
                            {item.recommended_action}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <select
                            className="w-full max-w-[5.5rem] rounded border border-stone-300 bg-white py-0.5 pl-1 pr-0 text-[11px] leading-tight"
                            value={triageMap[getItemKey(item)] || "new"}
                            onChange={(e) => setTriage(item, e.target.value as TriageStatus)}
                          >
                            <option value="new">new</option>
                            <option value="testing">test</option>
                            <option value="watch">watch</option>
                            <option value="adopted">done</option>
                            <option value="ignored">skip</option>
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`inline-block rounded border border-stone-200 px-1.5 py-0.5 text-[11px] tabular-nums ${scoreClass(Number(item.final_score || 0))}`}
                          >
                            {item.final_score}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-[11px] tabular-nums text-stone-500">
                          <span className="block truncate" title={item.published_date}>
                            {item.published_date
                              ? String(item.published_date).slice(0, 10)
                              : "—"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 pl-2 text-right">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-[11px] text-stone-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-3 py-2.5 text-xs sm:px-4">
              <p className="tabular-nums text-stone-600">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-sm border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 hover:bg-stone-100 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-1 tabular-nums text-stone-600">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-sm border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 hover:bg-stone-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>

          </div>

          <aside className="w-full shrink-0 border-t border-stone-200 pt-5 lg:sticky lg:top-3 lg:w-[17rem] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
              <div className="border-b border-stone-200 bg-[var(--accent-soft)] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Wire</p>
                <p className="mt-0.5 text-[11px] leading-snug text-stone-600">
                  Latest across feeds — each line opens the original source
                </p>
              </div>
              <div className="max-h-[min(62vh,440px)] divide-y divide-stone-200 overflow-y-auto overscroll-contain text-xs">
                {wireItems.length === 0 ? (
                  <p className="p-3 text-xs text-stone-500">No linked items yet.</p>
                ) : (
                  wireItems.map((item) => (
                    <a
                      key={getItemKey(item)}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-2.5 py-2 transition hover:bg-stone-50"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {item.source}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[12px] font-medium leading-snug text-stone-900">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-stone-500">{timeAgo(item.published_date)}</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-8 border-t border-stone-300 pt-5 text-center text-[11px] text-stone-500 sm:text-xs">
          <p className="font-headline text-sm text-stone-700">AI Tool Radar</p>
          <p className="mt-1">
            Signals from Hacker News, Product Hunt, GitHub, and arXiv — ranked for your lab.
          </p>
          {lastUpdated ? <p className="mt-2 text-stone-400">Last refresh (local): {lastUpdated}</p> : null}
        </footer>
      </div>
    </main>
  );
}
