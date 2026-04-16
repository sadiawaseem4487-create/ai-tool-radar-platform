import { randomUUID } from "crypto";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

export type AuditEvent = {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  entity: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarAuditEvents?: AuditEvent[];
};

const events = rootGlobal.__radarAuditEvents ?? [];
rootGlobal.__radarAuditEvents = events;

function memoryWriteAudit(event: Omit<AuditEvent, "id" | "created_at">): AuditEvent {
  const row: AuditEvent = {
    id: `aud_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    created_at: new Date().toISOString(),
    ...event,
  };
  events.unshift(row);
  if (events.length > 2000) {
    events.length = 2000;
  }
  return row;
}

function memoryListAuditByTenant(tenantId: string, limit = 200): AuditEvent[] {
  return events.filter((e) => e.tenant_id === tenantId).slice(0, limit);
}

async function ensureAuditSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_audit_tenant_created ON radar_audit_logs(tenant_id, created_at DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_audit_action_created ON radar_audit_logs(action, created_at DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_audit_actor_created ON radar_audit_logs(actor_id, created_at DESC)",
  );
}

async function postgresWriteAudit(event: Omit<AuditEvent, "id" | "created_at">): Promise<AuditEvent> {
  await ensureAuditSchema();
  const row: AuditEvent = {
    id: `aud_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    created_at: new Date().toISOString(),
    ...event,
  };
  await getDbPool().query(
    `
    INSERT INTO radar_audit_logs (id, tenant_id, actor_id, action, entity, entity_id, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
    `,
    [
      row.id,
      row.tenant_id,
      row.actor_id,
      row.action,
      row.entity,
      row.entity_id || null,
      JSON.stringify(row.metadata || {}),
      row.created_at,
    ],
  );
  return row;
}

async function postgresListAuditByTenant(tenantId: string, limit = 200): Promise<AuditEvent[]> {
  await ensureAuditSchema();
  const capped = Math.max(1, Math.min(2000, Math.trunc(limit)));
  const res = await getDbPool().query<{
    id: string;
    tenant_id: string;
    actor_id: string;
    action: string;
    entity: string;
    entity_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `
    SELECT id, tenant_id, actor_id, action, entity, entity_id, metadata, created_at
    FROM radar_audit_logs
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [tenantId, capped],
  );
  return res.rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    actor_id: r.actor_id,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id || undefined,
    metadata: r.metadata || undefined,
    created_at: r.created_at,
  }));
}

export async function writeAudit(event: Omit<AuditEvent, "id" | "created_at">): Promise<AuditEvent> {
  if (!isPostgresEnabled()) return memoryWriteAudit(event);
  try {
    return await postgresWriteAudit(event);
  } catch {
    return memoryWriteAudit(event);
  }
}

export async function listAuditByTenant(tenantId: string, limit = 200): Promise<AuditEvent[]> {
  if (!isPostgresEnabled()) return memoryListAuditByTenant(tenantId, limit);
  try {
    return await postgresListAuditByTenant(tenantId, limit);
  } catch {
    return memoryListAuditByTenant(tenantId, limit);
  }
}
