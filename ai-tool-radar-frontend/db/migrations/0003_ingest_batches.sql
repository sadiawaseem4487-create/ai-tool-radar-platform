-- AI Tool Radar - Migration 0003
-- Purpose: Track signed ingest batches for idempotency.

CREATE TABLE IF NOT EXISTS radar_ingest_batches (
  batch_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_ingest_batches_source_created
  ON radar_ingest_batches(source, created_at DESC);
