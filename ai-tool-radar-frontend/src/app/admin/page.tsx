"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StatsPayload = {
  tenant_id: string;
  members: { active_count: number };
  triage: { items_with_status: number };
  ingest: {
    rows_upserted_24h: number;
    rows_upserted_7d: number;
    events_24h: number;
    events_7d: number;
  };
  activity: {
    audit_events_24h: number;
    audit_events_7d: number;
    triage_updates_24h: number;
    triage_updates_7d: number;
  };
  sync: { failed_runs_7d: number; success_runs_7d: number };
  sources_last_success: Array<{ source: string; last_success_at: string; last_rows?: number }>;
  generated_at: string;
};

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const meRes = await fetch("/api/v1/me", { cache: "no-store" });
        if (meRes.status === 401) {
          window.location.href = "/login?next=/admin";
          return;
        }
        const meBody = (await meRes.json()) as {
          data?: { user?: { role?: string } };
        };
        const role = meBody.data?.user?.role;
        if (role !== "admin" && role !== "super_admin") {
          setError("Admin access required.");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/v1/admin/stats", { cache: "no-store" });
        const body = (await res.json()) as {
          data?: StatsPayload;
          error?: { message?: string };
        };
        if (!res.ok) {
          setError(body.error?.message || `Failed to load stats (HTTP ${res.status})`);
          setLoading(false);
          return;
        }
        setStats(body.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats.");
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
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Overview</h1>
          {stats?.tenant_id ? (
            <p className="mt-1 text-sm text-stone-600">Tenant: {stats.tenant_id}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link
              href="/admin/members"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Members
            </Link>
            <Link
              href="/admin/audit-logs"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Audit logs
            </Link>
            <Link
              href="/admin/jobs"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Job runs
            </Link>
            <Link
              href="/admin/metrics"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Metrics
            </Link>
            <Link
              href="/admin/sources"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Sources
            </Link>
            <Link
              href="/admin/tenant"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Tenant settings
            </Link>
            <Link href="/" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Radar
            </Link>
          </div>
        </div>

        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading overview...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error && stats ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="mb-4 text-[11px] text-stone-500">
              Figures below are derived from this deployment&apos;s audit log and triage store (in-memory
              unless you use a Postgres-backed build). Ingest totals appear when workers call{" "}
              <code className="rounded bg-stone-100 px-1">ingest.tools.write</code> with row counts.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Active members
                </p>
                <p className="mt-1 text-2xl font-bold text-stone-900">{stats.members.active_count}</p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Triage items
                </p>
                <p className="mt-1 text-2xl font-bold text-stone-900">{stats.triage.items_with_status}</p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Ingest rows (24h / 7d)
                </p>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {stats.ingest.rows_upserted_24h}{" "}
                  <span className="text-base font-normal text-stone-600">
                    / {stats.ingest.rows_upserted_7d}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-stone-600">
                  {stats.ingest.events_24h} ingest events (24h) · {stats.ingest.events_7d} (7d)
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Audit activity (24h / 7d)
                </p>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {stats.activity.audit_events_24h}{" "}
                  <span className="text-base font-normal text-stone-600">
                    / {stats.activity.audit_events_7d}
                  </span>
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Triage updates (24h / 7d)
                </p>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {stats.activity.triage_updates_24h}{" "}
                  <span className="text-base font-normal text-stone-600">
                    / {stats.activity.triage_updates_7d}
                  </span>
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  Sync audit (7d)
                </p>
                <p className="mt-1 text-sm text-stone-800">
                  Success: <span className="font-semibold">{stats.sync.success_runs_7d}</span> · Failed:{" "}
                  <span className="font-semibold text-red-800">{stats.sync.failed_runs_7d}</span>
                </p>
                <p className="mt-1 text-[11px] text-stone-500">
                  From <code className="rounded bg-stone-100 px-1">tool.sync</code> audit entries with{" "}
                  <code className="rounded bg-stone-100 px-1">metadata.ok</code>.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
                Last ingest by source (7d, from audit metadata)
              </p>
              {stats.sources_last_success.length === 0 ? (
                <p className="text-sm text-stone-500">No per-source ingest metadata recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                      <tr>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Last success</th>
                        <th className="px-3 py-2">Rows (event)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.sources_last_success.map((row) => (
                        <tr key={row.source} className="border-t border-stone-100">
                          <td className="px-3 py-2 font-medium text-stone-900">{row.source}</td>
                          <td className="px-3 py-2 text-stone-600">
                            {new Date(row.last_success_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-stone-600">{row.last_rows ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-4 text-[11px] text-stone-400">
              Generated {new Date(stats.generated_at).toLocaleString()}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
