-- AI Tool Radar - Migration 0002
-- Purpose: Add background job queue table and indexes.

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

CREATE INDEX IF NOT EXISTS idx_radar_job_queue_poll
  ON radar_job_queue(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_radar_job_queue_tenant_status
  ON radar_job_queue(tenant_id, status, created_at DESC);
