import { listAuditByTenant, type AuditEvent } from "@/lib/auth/audit";
import { listMembersForTenantRepo } from "@/lib/auth/member-repo";
import { countTriageForTenantRepo } from "@/lib/radar/triage-repo";

const MS_DAY = 24 * 60 * 60 * 1000;

function eventMs(e: AuditEvent): number {
  return new Date(e.created_at).getTime();
}

function inWindow(ms: number, now: number, windowMs: number): boolean {
  return ms >= now - windowMs && ms <= now;
}

export type AdminStatsPayload = {
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
  sync: {
    failed_runs_7d: number;
    success_runs_7d: number;
  };
  sources_last_success: Array<{
    source: string;
    last_success_at: string;
    last_rows?: number;
  }>;
  generated_at: string;
};

function numMeta(meta: Record<string, unknown> | undefined, key: string): number {
  if (!meta) return 0;
  const v = meta[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  return 0;
}

function sourceFromMeta(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  const s = meta.source;
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

export async function computeAdminStats(tenantId: string): Promise<AdminStatsPayload> {
  const now = Date.now();
  const w24 = MS_DAY;
  const w7 = 7 * MS_DAY;

  const events = await listAuditByTenant(tenantId, 2000);
  const members = await listMembersForTenantRepo(tenantId);

  let ingestRows24 = 0;
  let ingestRows7 = 0;
  let ingestEvents24 = 0;
  let ingestEvents7 = 0;
  let triageUp24 = 0;
  let triageUp7 = 0;
  let audit24 = 0;
  let audit7 = 0;
  let syncFail7 = 0;
  let syncOk7 = 0;

  const sourceSuccess = new Map<string, { at: string; rows?: number }>();

  for (const e of events) {
    const t = eventMs(e);
    if (!Number.isFinite(t)) continue;

    const in24 = inWindow(t, now, w24);
    const in7 = inWindow(t, now, w7);

    if (in24) audit24 += 1;
    if (in7) audit7 += 1;

    if (e.action === "ingest.tools.write") {
      const rows = numMeta(e.metadata, "rows_upserted") || numMeta(e.metadata, "rows_received");
      if (in24) {
        ingestEvents24 += 1;
        ingestRows24 += rows;
      }
      if (in7) {
        ingestEvents7 += 1;
        ingestRows7 += rows;
      }
      const src = sourceFromMeta(e.metadata);
      if (src && in7) {
        const prev = sourceSuccess.get(src);
        if (!prev || t > new Date(prev.at).getTime()) {
          sourceSuccess.set(src, { at: e.created_at, rows });
        }
      }
    }

    if (e.action === "tool.triage.update") {
      if (in24) triageUp24 += 1;
      if (in7) triageUp7 += 1;
    }

    if (e.action === "tool.sync") {
      const ok = e.metadata && e.metadata.ok === true;
      const failed = e.metadata && e.metadata.ok === false;
      if (in7) {
        if (ok) syncOk7 += 1;
        if (failed) syncFail7 += 1;
      }
    }
  }

  const sources_last_success = Array.from(sourceSuccess.entries())
    .map(([source, v]) => ({
      source,
      last_success_at: v.at,
      last_rows: v.rows,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));

  return {
    tenant_id: tenantId,
    members: { active_count: members.length },
    triage: { items_with_status: await countTriageForTenantRepo(tenantId) },
    ingest: {
      rows_upserted_24h: ingestRows24,
      rows_upserted_7d: ingestRows7,
      events_24h: ingestEvents24,
      events_7d: ingestEvents7,
    },
    activity: {
      audit_events_24h: audit24,
      audit_events_7d: audit7,
      triage_updates_24h: triageUp24,
      triage_updates_7d: triageUp7,
    },
    sync: {
      failed_runs_7d: syncFail7,
      success_runs_7d: syncOk7,
    },
    sources_last_success,
    generated_at: new Date().toISOString(),
  };
}
