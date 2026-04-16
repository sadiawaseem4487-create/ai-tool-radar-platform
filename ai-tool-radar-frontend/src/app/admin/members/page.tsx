"use client";

import { useEffect, useState } from "react";

type Member = {
  user_id: string;
  email: string;
  role: string;
  tenant_id: string;
  memberships: string[];
};

type MembersPayload = {
  data?: {
    tenant_id: string;
    members: Member[];
  };
  error?: {
    code: string;
    message: string;
  };
};

export default function AdminMembersPage() {
  const [tenantId, setTenantId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteBusy, setInviteBusy] = useState(false);

  const loadMembers = async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/v1/me", { cache: "no-store" });
      if (meRes.status === 401) {
        window.location.href = "/login?next=/admin/members";
        return;
      }
      const meBody = (await meRes.json()) as {
        data?: { user?: { role?: string } };
        error?: { message?: string };
      };
      const role = meBody.data?.user?.role;
      if (role !== "admin" && role !== "super_admin") {
        setError("Admin access required.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/v1/admin/members", { cache: "no-store" });
      const body = (await res.json()) as MembersPayload;
      if (!res.ok) {
        setError(body.error?.message || `Failed to load members (HTTP ${res.status})`);
        setLoading(false);
        return;
      }

      setTenantId(body.data?.tenant_id || "");
      setMembers(body.data?.members || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const updateRole = async (userId: string, role: string) => {
    setStatus("");
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/v1/admin/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus(body.error?.message || `Role update failed (HTTP ${res.status})`);
        return;
      }
      setStatus("Member role updated.");
      await loadMembers();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Role update failed.");
    } finally {
      setBusyUserId("");
    }
  };

  const removeMember = async (userId: string) => {
    setStatus("");
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/v1/admin/members/${userId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus(body.error?.message || `Remove failed (HTTP ${res.status})`);
        return;
      }
      setStatus("Member removed from tenant.");
      await loadMembers();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setBusyUserId("");
    }
  };

  const inviteMember = async () => {
    setStatus("");
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setStatus("Email is required.");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch("/api/v1/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setStatus(body.error?.message || `Invite failed (HTTP ${res.status})`);
        return;
      }
      setInviteEmail("");
      setInviteRole("user");
      setStatus("Member invited.");
      await loadMembers();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <section className="border border-stone-300 bg-[var(--paper-card)] shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-500">Admin</p>
          <h1 className="font-headline mt-1 text-2xl font-bold text-stone-900">Members</h1>
          {tenantId ? <p className="mt-1 text-sm text-stone-600">Tenant: {tenantId}</p> : null}
          <div className="mt-2">
            <a
              href="/admin"
              className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Admin overview
            </a>
          </div>
        </div>
        <div className="border-b border-stone-200 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Invite member</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-56 flex-col gap-1 text-xs text-stone-600">
              Email
              <input
                type="email"
                className="rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="newuser@example.com"
                disabled={inviteBusy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-600">
              Role
              <select
                className="rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={inviteBusy}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </label>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={inviteMember}
              className="rounded border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {inviteBusy ? "Inviting..." : "Invite"}
            </button>
          </div>
        </div>

        {status ? <p className="border-b border-stone-200 px-5 py-2 text-xs text-stone-600">{status}</p> : null}
        {loading ? <p className="px-5 py-6 text-sm text-stone-500">Loading members...</p> : null}
        {error ? <p className="px-5 py-6 text-sm text-red-700">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">User ID</th>
                  <th className="px-4 py-2">Memberships</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t border-stone-100">
                    <td className="px-4 py-2 font-medium text-stone-900">{m.email}</td>
                    <td className="px-4 py-2 text-stone-700">
                      <select
                        className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                        value={m.role}
                        disabled={busyUserId === m.user_id}
                        onChange={(e) =>
                          setMembers((prev) =>
                            prev.map((x) =>
                              x.user_id === m.user_id ? { ...x, role: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-stone-600">{m.user_id}</td>
                    <td className="px-4 py-2 text-stone-600">{m.memberships.join(", ") || "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyUserId === m.user_id}
                          onClick={() => updateRole(m.user_id, m.role)}
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                        >
                          Save role
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === m.user_id}
                          onClick={() => removeMember(m.user_id)}
                          className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
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
