"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SourceRow = {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  schedule_minutes: number;
  test_url: string;
  last_test_status?: "success" | "failed";
  last_tested_at?: string;
  last_test_error?: string;
};

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");
  const [warmingTools, setWarmingTools] = useState(false);

  const loadSources = async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/v1/me", { cache: "no-store" });
      if (meRes.status === 401) {
        window.location.href = "/login?next=/admin/sources";
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

      const res = await fetch("/api/v1/admin/sources", { cache: "no-store" });
      const body = (await res.json()) as {
        data?: { sources?: SourceRow[] };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(body.error?.message || `Failed to load sources (HTTP ${res.status})`);
        setLoading(false);
        return;
      }
      setSources(body.data?.sources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const updateSource = async (row: SourceRow) => {
    setStatus("");
    setBusyId(row.id);
    try {
      const res = await fetch("/api/v1/admin/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          enabled: row.enabled,
          schedule_minutes: row.schedule_minutes,
        }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus(body.error?.message || `Save failed (HTTP ${res.status})`);
        return;
      }
      setStatus(`${row.name} updated.`);
      await loadSources();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusyId("");
    }
  };

  const testConnection = async (id: string) => {
    setStatus("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/sources/${id}/test`, { method: "POST" });
      const body = (await res.json()) as {
        data?: { ok?: boolean; error?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        setStatus(body.data?.error || body.error?.message || `Test failed (HTTP ${res.status})`);
      } else {
        setStatus("Connection test passed.");
      }
      await loadSources();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection test failed.");
    } finally {
      setBusyId("");
    }
  };

  const warmToolsCache = async () => {
    setStatus("");
    setWarmingTools(true);
    try {
      const res = await fetch("/api/v1/admin/tools/warm", { method: "POST" });
      const body = (await res.json()) as {
        data?: { inserted?: number; postgres_enabled?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setStatus(body.error?.message || `Warm failed (HTTP ${res.status})`);
        return;
      }
      const inserted = body.data?.inserted ?? 0;
      const db = body.data?.postgres_enabled ? "Postgres" : "upstream fallback";
      setStatus(`Tools cache warmed: ${inserted} rows synced (${db}).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Warm failed.");
    } finally {
      setWarmingTools(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-500">Admin</p>
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Sources</h1>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link href="/admin" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Overview
            </Link>
            <Link href="/admin/jobs" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Job runs
            </Link>
            <button
              type="button"
              onClick={warmToolsCache}
              disabled={warmingTools}
              className="rounded border border-stone-300 bg-white px-2 py-1 font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {warmingTools ? "Warming tools..." : "Warm tools cache"}
            </button>
          </div>
        </div>

        {status ? <p className="border-b border-stone-200 px-5 py-2 text-xs text-stone-600">{status}</p> : null}
        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading sources...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Schedule (min)</th>
                  <th className="px-3 py-2">Last test</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Error</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 font-medium text-stone-900">{row.name}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          setSources((prev) =>
                            prev.map((x) => (x.id === row.id ? { ...x, enabled: e.target.checked } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        className="w-24 rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                        value={row.schedule_minutes}
                        onChange={(e) =>
                          setSources((prev) =>
                            prev.map((x) =>
                              x.id === row.id
                                ? {
                                    ...x,
                                    schedule_minutes: Math.max(
                                      5,
                                      Math.min(1440, Number(e.target.value) || 30),
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {row.last_tested_at ? new Date(row.last_tested_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.last_test_status ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            row.last_test_status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {row.last_test_status}
                        </span>
                      ) : (
                        <span className="text-stone-400">not tested</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-stone-600">
                      {row.last_test_error || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateSource(row)}
                          disabled={busyId === row.id}
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => testConnection(row.id)}
                          disabled={busyId === row.id}
                          className="rounded border border-stone-900 bg-stone-900 px-2 py-1 text-xs text-white hover:bg-stone-800 disabled:opacity-50"
                        >
                          Test connection
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sources.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-stone-500" colSpan={7}>
                      No sources configured.
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
