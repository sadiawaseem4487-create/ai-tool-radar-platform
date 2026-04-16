"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TenantSettings = {
  tenant_id: string;
  display_name: string;
  timezone: string;
  status: "active" | "suspended";
  updated_at: string;
};

export default function AdminTenantPage() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadTenant = async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/v1/me", { cache: "no-store" });
      if (meRes.status === 401) {
        window.location.href = "/login?next=/admin/tenant";
        return;
      }
      const meBody = (await meRes.json()) as { data?: { user?: { role?: string } } };
      const role = meBody.data?.user?.role;
      if (role !== "admin" && role !== "super_admin") {
        setError("Admin access required.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/v1/admin/tenant", { cache: "no-store" });
      const body = (await res.json()) as {
        data?: TenantSettings;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(body.error?.message || `Failed to load tenant settings (HTTP ${res.status})`);
        setLoading(false);
        return;
      }
      setTenant(body.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenant settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenant();
  }, []);

  const save = async () => {
    if (!tenant) return;
    setStatus("");
    try {
      const res = await fetch("/api/v1/admin/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: tenant.display_name,
          timezone: tenant.timezone,
          status: tenant.status,
        }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus(body.error?.message || `Save failed (HTTP ${res.status})`);
        return;
      }
      setStatus("Tenant settings updated.");
      await loadTenant();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-500">Admin</p>
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Tenant settings</h1>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link href="/admin" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Overview
            </Link>
            <Link
              href="/admin/members"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Members
            </Link>
          </div>
        </div>

        {status ? <p className="border-b border-stone-200 px-5 py-2 text-xs text-stone-600">{status}</p> : null}
        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading tenant settings...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error && tenant ? (
          <div className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="tenant-display-name" className="mb-1 block text-xs text-stone-600">
                Display name
              </label>
              <input
                id="tenant-display-name"
                className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
                value={tenant.display_name}
                onChange={(e) => setTenant({ ...tenant, display_name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="tenant-timezone" className="mb-1 block text-xs text-stone-600">
                Timezone
              </label>
              <input
                id="tenant-timezone"
                className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
                value={tenant.timezone}
                onChange={(e) => setTenant({ ...tenant, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>
            <div>
              <label htmlFor="tenant-status" className="mb-1 block text-xs text-stone-600">
                Status
              </label>
              <select
                id="tenant-status"
                className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
                value={tenant.status}
                onChange={(e) =>
                  setTenant({
                    ...tenant,
                    status: e.target.value === "suspended" ? "suspended" : "active",
                  })
                }
              >
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
            <p className="text-xs text-stone-500">
              Tenant ID: <code>{tenant.tenant_id}</code>
            </p>
            <p className="text-xs text-stone-400">
              Updated: {new Date(tenant.updated_at).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={save}
              className="rounded border border-stone-900 bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              Save settings
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
