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
  const latestResearch = useMemo(
    () =>
      latestByDate
        .filter((x) => x.source === "arXiv" || x.source === "HackerNews")
        .slice(0, 8),
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl bg-slate-900 px-6 py-7 text-white">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
            AI NEWS DESK
          </p>
          <h1 className="mt-2 text-3xl font-bold">AI Tool Radar - Daily Briefing</h1>
          <p className="mt-2 text-sm text-slate-300">
            Latest tools, research articles, and top AI trends in one newsroom-style feed.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span>Last sync: {lastUpdated || "not loaded yet"}</span>
            <span>Collector run: {apiMeta?.last_collector_run || "unknown"}</span>
            <span className="rounded-full bg-slate-700 px-2 py-0.5">
              Unique rows: {apiMeta?.unique_rows ?? "-"}
            </span>
            <span className="rounded-full bg-slate-700 px-2 py-0.5">
              Dedup removed: {apiMeta?.duplicate_rows_removed ?? "-"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 ${
                health === "healthy"
                  ? "bg-green-700 text-green-100"
                  : health === "degraded"
                    ? "bg-red-700 text-red-100"
                    : "bg-amber-700 text-amber-100"
              }`}
            >
              Webhook: {health}
            </span>
            <button
              onClick={loadItems}
              className="rounded-md bg-slate-700 px-2.5 py-1 text-white hover:bg-slate-600"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Filtered Items</p>
            <p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Avg Score</p>
            <p className="mt-1 text-2xl font-semibold">{avgScore}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Testing Queue</p>
            <p className="mt-1 text-2xl font-semibold">{testingItems.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Watch Queue</p>
            <p className="mt-1 text-2xl font-semibold">{watchItems.length}</p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <input
              ref={searchRef}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Search title, summary, why..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s} value={s}>
                  Source: {s}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="all">Action: all</option>
              <option value="Test">Action: Test</option>
              <option value="Watch">Action: Watch</option>
              <option value="Ignore">Action: Ignore</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="score">Sort: score</option>
              <option value="latest">Sort: latest</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="all">Date: all</option>
              <option value="7d">Date: 7 days</option>
              <option value="30d">Date: 30 days</option>
            </select>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <label htmlFor="min-score" className="text-slate-600">
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
            />
            <button
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Export CSV
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                viewMode === "table" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                viewMode === "cards" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Cards
            </button>
            <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlyNewSinceVisit}
                onChange={(e) => setOnlyNewSinceVisit(e.target.checked)}
              />
              Only new since last visit
            </label>
            <span className="text-xs text-slate-500">
              Shortcuts: `/` search, `n` toggle new, `t` Test, `w` Watch
            </span>
          </div>
        </section>

        <section className="mb-8 grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Top Story
            </p>
            {top ? (
              <>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{top.title}</h2>
                <p className="mt-3 text-sm text-slate-600">{top.summary}</p>
                <p className="mt-2 text-sm text-slate-700">{top.why_it_matters}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 ${scoreClass(Number(top.final_score || 0))}`}>
                    Score {top.final_score}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800">
                    {top.category || "unknown"}
                  </span>
                  <span className={`rounded-full px-2 py-1 ${badgeClass(top.recommended_action)}`}>
                    {top.recommended_action}
                  </span>
                  <span className="text-slate-500">{top.source}</span>
                  <span className="text-slate-400">{timeAgo(top.published_date)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {top.url ? (
                    <a
                      href={top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      Read Story
                    </a>
                  ) : null}
                  <button
                    onClick={() => setTriage(top, "testing")}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Move to Testing
                  </button>
                  <button
                    onClick={() => setTriage(top, "watch")}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Move to Watch
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">No top story available.</p>
            )}
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Trending Now
            </h3>
            <div className="mt-3 space-y-3">
              {trendingNow.slice(0, 6).map((item) => (
                <div key={getItemKey(item)} className="border-b border-slate-100 pb-3 last:border-b-0">
                  <p className="text-sm font-medium leading-snug text-slate-900">{item.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 ${scoreClass(Number(item.final_score || 0))}`}>
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

        <section className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">New Candidates</h3>
            <p className="mt-1 text-2xl font-semibold">{newItems.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Testing This Week</h3>
            <p className="mt-1 text-2xl font-semibold">{testingItems.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Watchlist</h3>
            <p className="mt-1 text-2xl font-semibold">{watchItems.length}</p>
          </div>
        </section>

        <section className="mb-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Latest Tools</h3>
            <p className="mb-3 text-xs text-slate-500">Product launches and repositories</p>
            <div className="space-y-3">
              {latestTools.map((item) => (
                <article key={getItemKey(item)} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium text-slate-900">{item.title}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${scoreClass(Number(item.final_score || 0))}`}>
                      {item.final_score}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.summary}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{item.source}</span>
                    <span>{timeAgo(item.published_date)}</span>
                    <span className={`rounded-full px-2 py-0.5 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Latest Articles & Research</h3>
            <p className="mb-3 text-xs text-slate-500">HN + arXiv highlights for daily scan</p>
            <div className="space-y-3">
              {latestResearch.map((item) => (
                <article key={getItemKey(item)} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium text-slate-900">{item.title}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${scoreClass(Number(item.final_score || 0))}`}>
                      {item.final_score}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.summary}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{item.source}</span>
                    <span>{timeAgo(item.published_date)}</span>
                    <span className={`rounded-full px-2 py-0.5 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold">Top Headlines</h3>
          <p className="mb-3 text-xs text-slate-500">Editorial-style summary of highest ranked signals</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {topStories.map((item) => (
              <a
                key={getItemKey(item)}
                href={item.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-100 p-3 transition hover:border-slate-300"
              >
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span>{item.source}</span>
                  <span>{timeAgo(item.published_date)}</span>
                  <span className={`rounded-full px-2 py-0.5 ${scoreClass(Number(item.final_score || 0))}`}>
                    {item.final_score}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold">Source Quality</h3>
          </div>
          <div className="border-b border-slate-200 px-6 py-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Score Trend (last 14 days)</p>
            {scoreTrend ? (
              <svg viewBox="0 0 100 100" className="h-20 w-full">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-indigo-600"
                  points={scoreTrend}
                />
              </svg>
            ) : (
              <p className="text-xs text-slate-500">Not enough dated points to render trend.</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Items</th>
                  <th className="px-4 py-3 font-semibold">Avg Score</th>
                  <th className="px-4 py-3 font-semibold">Test Rate</th>
                </tr>
              </thead>
              <tbody>
                {sourceMetrics.map(([name, metric]) => (
                  <tr key={name} className="border-t border-slate-200">
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3">{metric.count}</td>
                    <td className="px-4 py-3">{metric.avgScore.toFixed(2)}</td>
                    <td className="px-4 py-3">{metric.testRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">All Ranked Items</h3>
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="page-size" className="text-slate-500">
                  Rows
                </label>
                <select
                  id="page-size"
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
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
          <div className="divide-y divide-slate-200">
            {loading ? (
              <div className="px-6 py-8 text-slate-500">Loading items from webhook...</div>
            ) : error ? (
              <div className="px-6 py-8">
                <p className="text-red-600">Could not load webhook data: {error}</p>
                <button
                  onClick={loadItems}
                  className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-8 text-slate-500">
                Webhook returned zero items. Check your n8n workflow run and sheet data.
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-8">
                <p className="text-slate-500">
                  No items match your current filters.
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  Reset Filters
                </button>
              </div>
            ) : viewMode === "cards" ? (
              paginated.map((item) => (
                <article key={item.id || item.url} className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-medium">{item.title}</h4>
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{item.summary}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.why_it_matters}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm ${scoreClass(
                        Number(item.final_score || 0),
                      )}`}
                    >
                      {item.final_score}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800">
                      {item.category || "unknown"}
                    </span>
                    <span className={`rounded-full px-2 py-1 ${badgeClass(item.recommended_action)}`}>
                      {item.recommended_action}
                    </span>
                    {triageMap[getItemKey(item)] ? (
                      <span className={`rounded-full px-2 py-1 ${badgeClass(triageMap[getItemKey(item)])}`}>
                        {triageMap[getItemKey(item)]}
                      </span>
                    ) : null}
                    <span className="text-slate-500">{item.source}</span>
                    <span className="text-slate-400">{item.published_date}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setTriage(item, "testing")}
                      className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700"
                    >
                      Testing
                    </button>
                    <button
                      onClick={() => setTriage(item, "watch")}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700"
                    >
                      Watch
                    </button>
                    <button
                      onClick={() => setTriage(item, "adopted")}
                      className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                    >
                      Adopted
                    </button>
                    <button
                      onClick={() => setTriage(item, "ignored")}
                      className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      Ignore
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Source</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Triage</th>
                      <th className="px-4 py-3 font-semibold">Score</th>
                      <th className="px-4 py-3 font-semibold">Published</th>
                      <th className="px-4 py-3 font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((item) => (
                      <tr key={item.id || item.url} className="border-t border-slate-200 align-top">
                        <td className="max-w-md px-4 py-3">
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{item.source}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-800">
                            {item.category || "unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${badgeClass(item.recommended_action)}`}>
                            {item.recommended_action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={triageMap[getItemKey(item)] || "new"}
                            onChange={(e) => setTriage(item, e.target.value as TriageStatus)}
                          >
                            <option value="new">new</option>
                            <option value="testing">testing</option>
                            <option value="watch">watch</option>
                            <option value="adopted">adopted</option>
                            <option value="ignored">ignored</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${scoreClass(Number(item.final_score || 0))}`}>
                            {item.final_score}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {item.published_date}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {filtered.length > 0 ? (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 text-sm">
              <p className="text-slate-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-slate-700">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
