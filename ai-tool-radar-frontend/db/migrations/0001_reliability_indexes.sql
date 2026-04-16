-- AI Tool Radar - Migration 0001
-- Purpose: Add reliability/performance indexes for tenant-scoped queries.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_radar_tools_source ON radar_tools(source);
CREATE INDEX IF NOT EXISTS idx_radar_tools_category ON radar_tools(category);
CREATE INDEX IF NOT EXISTS idx_radar_tools_action ON radar_tools(recommended_action);
CREATE INDEX IF NOT EXISTS idx_radar_tools_score ON radar_tools(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_radar_tools_published ON radar_tools(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_radar_tools_lifecycle
  ON radar_tools(lifecycle_status, is_hot, is_recent, is_discontinued);
CREATE INDEX IF NOT EXISTS idx_radar_tools_updated ON radar_tools(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_audit_tenant_created
  ON radar_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_audit_action_created
  ON radar_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_audit_actor_created
  ON radar_audit_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_started
  ON radar_job_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_status
  ON radar_job_runs(tenant_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_job_runs_tenant_source
  ON radar_job_runs(tenant_id, source, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_tool_comments_tenant_tool_created
  ON radar_tool_comments(tenant_id, tool_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_tool_comments_tenant_actor_created
  ON radar_tool_comments(tenant_id, actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_triage_tenant_updated
  ON radar_triage_status(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_source_configs_tenant_name
  ON radar_source_configs(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_radar_source_configs_tenant_enabled
  ON radar_source_configs(tenant_id, enabled);

CREATE INDEX IF NOT EXISTS idx_radar_users_role ON radar_users(role);
CREATE INDEX IF NOT EXISTS idx_radar_users_tenant ON radar_users(tenant_id);
