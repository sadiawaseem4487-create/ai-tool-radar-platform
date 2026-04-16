import { listAuditByTenant, type AuditEvent } from "@/lib/auth/audit";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

export type AdminJobRun = {
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

async function ensureJobRunsSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_job_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      items_in INTEGER NOT NULL DEFAULT 0,
      items_upserted INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT,
      triggered_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_started ON radar_job_runs(tenant_id, started_at DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_status ON radar_job_runs(tenant_id, status, started_at DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_source ON radar_job_runs(tenant_id, source, started_at DESC)",
  );
}

function num(meta: Record<string, unknown> | undefined, key: string): number {
  if (!meta) return 0;
  const value = meta[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  return 0;
}

function text(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!meta) return undefined;
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toJob(event: AuditEvent): AdminJobRun | null {
  if (event.action !== "ingest.tools.write" && event.action !== "tool.sync") return null;
  const source = text(event.metadata, "source") || "mixed";
  const ok = event.action === "ingest.tools.write" ? true : event.metadata?.ok === true;
  const startedAt = text(event.metadata, "started_at") || event.created_at;
  const finishedAt = text(event.metadata, "finished_at") || event.created_at;
  const durationMs =
    num(event.metadata, "duration_ms") ||
    Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const itemsIn = num(event.metadata, "rows_received") || num(event.metadata, "upstream_count");
  const itemsUpserted = num(event.metadata, "rows_upserted") || num(event.metadata, "count");
  const errorSummary = text(event.metadata, "error") || text(event.metadata, "error_summary");

  return {
    id: event.id,
    source,
    status: ok ? "success" : "failed",
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    items_in: itemsIn,
    items_upserted: itemsUpserted,
    error_summary: errorSummary,
    triggered_by: event.actor_id,
  };
}

export async function writeAdminJobRun(input: AdminJobRun & { tenant_id: string }): Promise<void> {
  if (!isPostgresEnabled()) return;
  try {
    await ensureJobRunsSchema();
    await getDbPool().query(
      `
      INSERT INTO radar_job_runs (
        id, tenant_id, source, status, started_at, finished_at, duration_ms, items_in, items_upserted, error_summary, triggered_by
      )
      VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        input.id,
        input.tenant_id,
        input.source,
        input.status,
        input.started_at,
        input.finished_at,
        input.duration_ms,
        input.items_in,
        input.items_upserted,
        input.error_summary || null,
        input.triggered_by,
      ],
    );
  } catch {
    // Silent fallback: jobs endpoint will derive from audit if DB write fails.
  }
}

async function listAdminJobsFromDb(input: {
  tenantId: string;
  limit: number;
  status?: "success" | "failed";
  source?: string;
}): Promise<AdminJobRun[]> {
  await ensureJobRunsSchema();
  const capped = Math.max(1, Math.min(200, Math.trunc(input.limit)));
  const status = input.status || null;
  const source = input.source?.trim() || null;
  const res = await getDbPool().query<{
    id: string;
    source: string;
    status: "success" | "failed";
    started_at: string;
    finished_at: string;
    duration_ms: number;
    items_in: number;
    items_upserted: number;
    error_summary: string | null;
    triggered_by: string;
  }>(
    `
    SELECT id, source, status, started_at, finished_at, duration_ms, items_in, items_upserted, error_summary, triggered_by
    FROM radar_job_runs
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR status = $2::text)
      AND ($3::text IS NULL OR LOWER(source) = LOWER($3::text))
    ORDER BY started_at DESC
    LIMIT $4
    `,
    [input.tenantId, status, source, capped],
  );
  return res.rows.map((r) => ({
    id: r.id,
    source: r.source,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    duration_ms: Number(r.duration_ms) || 0,
    items_in: Number(r.items_in) || 0,
    items_upserted: Number(r.items_upserted) || 0,
    error_summary: r.error_summary || undefined,
    triggered_by: r.triggered_by,
  }));
}

export async function listAdminJobs(input: {
  tenantId: string;
  limit: number;
  status?: "success" | "failed";
  source?: string;
}): Promise<AdminJobRun[]> {
  if (isPostgresEnabled()) {
    try {
      const dbJobs = await listAdminJobsFromDb(input);
      if (dbJobs.length > 0) return dbJobs;
    } catch {
      // fallback below
    }
  }
  const events = await listAuditByTenant(input.tenantId, 2000);
  const sourceFilter = input.source?.trim().toLowerCase();
  const out: AdminJobRun[] = [];
  for (const event of events) {
    const job = toJob(event);
    if (!job) continue;
    if (input.status && job.status !== input.status) continue;
    if (sourceFilter && job.source.toLowerCase() !== sourceFilter) continue;
    out.push(job);
    if (out.length >= input.limit) break;
  }
  return out;
}
