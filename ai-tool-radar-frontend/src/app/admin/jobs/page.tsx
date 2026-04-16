"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type JobRun = {
  id: string;
  source: string;
  status: "success" | "failed";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  items_in: number;
  items_upserted: number;
  error_summary?: string;
  triggered_by: string;
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const meRes = await fetch("/api/v1/me", { cache: "no-store" });
        if (meRes.status === 401) {
          window.location.href = "/login?next=/admin/jobs";
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

        const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
        const res = await fetch(`/api/v1/admin/jobs${qs}`, { cache: "no-store" });
        const body = (await res.json()) as {
          data?: { jobs?: JobRun[] };
          error?: { message?: string };
        };
        if (!res.ok) {
          setError(body.error?.message || `Failed to load jobs (HTTP ${res.status})`);
          setLoading(false);
          return;
        }
        setJobs(body.data?.jobs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load jobs.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [statusFilter]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-500">Admin</p>
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Job runs</h1>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link
              href="/admin"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Overview
            </Link>
            <Link
              href="/admin/audit-logs"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Audit logs
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded border px-2 py-1 ${
                statusFilter === "all"
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("success")}
              className={`rounded border px-2 py-1 ${
                statusFilter === "success"
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("failed")}
              className={`rounded border px-2 py-1 ${
                statusFilter === "failed"
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              Failed
            </button>
          </div>
        </div>

        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading job runs...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Upserted</th>
                  <th className="px-3 py-2">Triggered by</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-600">{new Date(job.started_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium text-stone-900">{job.source}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          job.status === "success"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-600">{Math.round(job.duration_ms / 1000)}s</td>
                    <td className="px-3 py-2 text-stone-700">{job.items_in}</td>
                    <td className="px-3 py-2 text-stone-700">{job.items_upserted}</td>
                    <td className="px-3 py-2 text-stone-700">{job.triggered_by}</td>
                    <td className="max-w-[20rem] truncate px-3 py-2 text-stone-600">
                      {job.error_summary || "—"}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-stone-500" colSpan={8}>
                      No job runs found for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
