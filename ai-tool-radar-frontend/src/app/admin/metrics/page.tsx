"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MetricsPayload = {
  uptime_seconds: number;
  process: {
    rss_bytes: number;
    heap_used_bytes: number;
    heap_total_bytes: number;
    node_version: string;
  };
  postgres: {
    enabled: boolean;
    connected: boolean;
    latency_ms?: number;
  };
  postgres_pool:
    | { enabled: false }
    | {
        enabled: true;
        total_connections: number;
        idle_connections: number;
        waiting_clients: number;
      };
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/v1/admin/metrics", { cache: "no-store" });
        const body = (await res.json()) as {
          data?: MetricsPayload;
          error?: { message?: string };
        };
        if (!res.ok) {
          setError(body.error?.message || `Failed to load metrics (HTTP ${res.status})`);
          return;
        }
        setMetrics(body.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-500">Admin</p>
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Metrics</h1>
          <div className="mt-2">
            <Link
              href="/admin"
              className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Admin overview
            </Link>
          </div>
        </div>

        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading metrics...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error && metrics ? (
          <div className="px-4 py-4 sm:px-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Uptime</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">{formatUptime(metrics.uptime_seconds)}</p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Postgres</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">
                  {metrics.postgres.enabled ? (metrics.postgres.connected ? "Connected" : "Unavailable") : "Disabled"}
                </p>
                <p className="mt-1 text-[11px] text-stone-600">
                  Latency: {metrics.postgres.latency_ms ?? "—"} ms
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">RSS memory</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {formatBytes(metrics.process.rss_bytes)}
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Node</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">{metrics.process.node_version}</p>
                <p className="mt-1 text-[11px] text-stone-600">
                  Heap: {formatBytes(metrics.process.heap_used_bytes)} /{" "}
                  {formatBytes(metrics.process.heap_total_bytes)}
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Metric</th>
                    <th className="px-3 py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-700">Postgres enabled</td>
                    <td className="px-3 py-2 text-stone-900">{String(metrics.postgres.enabled)}</td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-700">Postgres connected</td>
                    <td className="px-3 py-2 text-stone-900">{String(metrics.postgres.connected)}</td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-700">Pool total connections</td>
                    <td className="px-3 py-2 text-stone-900">
                      {metrics.postgres_pool.enabled ? metrics.postgres_pool.total_connections : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-700">Pool idle connections</td>
                    <td className="px-3 py-2 text-stone-900">
                      {metrics.postgres_pool.enabled ? metrics.postgres_pool.idle_connections : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-700">Pool waiting clients</td>
                    <td className="px-3 py-2 text-stone-900">
                      {metrics.postgres_pool.enabled ? metrics.postgres_pool.waiting_clients : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
