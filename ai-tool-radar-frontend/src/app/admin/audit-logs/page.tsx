"use client";

import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  entity: string;
  entity_id?: string;
  created_at: string;
};

export default function AdminAuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/v1/admin/audit-logs?limit=200", { cache: "no-store" });
        const body = (await res.json()) as {
          data?: { events?: AuditEvent[] };
          error?: { message?: string };
        };
        if (!res.ok) {
          setError(body.error?.message || `Failed to load logs (HTTP ${res.status})`);
          setLoading(false);
          return;
        }
        setEvents(body.data?.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logs.");
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
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Audit logs</h1>
          <div className="mt-2">
            <a
              href="/admin"
              className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Admin overview
            </a>
          </div>
        </div>

        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading logs...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Entity</th>
                  <th className="px-4 py-2">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-stone-100">
                    <td className="px-4 py-2 text-stone-600">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-stone-700">{e.actor_id}</td>
                    <td className="px-4 py-2 font-medium text-stone-900">{e.action}</td>
                    <td className="px-4 py-2 text-stone-700">{e.entity}</td>
                    <td className="px-4 py-2 text-stone-600">{e.entity_id || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
