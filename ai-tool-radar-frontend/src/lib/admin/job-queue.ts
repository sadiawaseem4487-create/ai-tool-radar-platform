import { randomUUID } from "crypto";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

type QueueStatus = "queued" | "running" | "done" | "failed";

export type JobQueueItem = {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
  available_at: string;
  started_at?: string;
  finished_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
};

async function ensureQueueSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_job_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_job_queue_poll ON radar_job_queue(status, available_at, created_at)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_job_queue_tenant_status ON radar_job_queue(tenant_id, status, created_at DESC)",
  );
}

export async function enqueueJob(input: {
  tenant_id: string;
  job_type: string;
  payload?: Record<string, unknown>;
  available_at?: string;
}): Promise<JobQueueItem | null> {
  if (!isPostgresEnabled()) return null;
  await ensureQueueSchema();
  const id = `jq_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const res = await getDbPool().query<JobQueueItem>(
    `
    INSERT INTO radar_job_queue (
      id, tenant_id, job_type, payload, status, attempts, available_at, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4::jsonb, 'queued', 0, COALESCE($5::timestamptz, NOW()), NOW(), NOW())
    RETURNING id, tenant_id, job_type, payload, status, attempts, available_at::text, started_at::text, finished_at::text, last_error, created_at::text, updated_at::text
    `,
    [id, input.tenant_id, input.job_type, JSON.stringify(input.payload || {}), input.available_at || null],
  );
  return res.rows[0] || null;
}

