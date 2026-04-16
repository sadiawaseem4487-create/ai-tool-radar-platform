import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

async function ensureIngestSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_ingest_batches (
      batch_key TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      rows_received INTEGER NOT NULL DEFAULT 0,
      rows_upserted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_ingest_batches_source_created ON radar_ingest_batches(source, created_at DESC)",
  );
}

export async function ingestBatchExists(batchKey: string): Promise<boolean> {
  if (!isPostgresEnabled()) return false;
  await ensureIngestSchema();
  const res = await getDbPool().query("SELECT 1 FROM radar_ingest_batches WHERE batch_key = $1 LIMIT 1", [batchKey]);
  return (res.rowCount || 0) > 0;
}

export async function recordIngestBatch(input: {
  batch_key: string;
  source: string;
  batch_id: string;
  request_id: string;
  rows_received: number;
  rows_upserted: number;
}): Promise<void> {
  if (!isPostgresEnabled()) return;
  await ensureIngestSchema();
  await getDbPool().query(
    `
    INSERT INTO radar_ingest_batches (batch_key, source, batch_id, request_id, rows_received, rows_upserted)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (batch_key) DO NOTHING
    `,
    [
      input.batch_key,
      input.source,
      input.batch_id,
      input.request_id,
      input.rows_received,
      input.rows_upserted,
    ],
  );
}
