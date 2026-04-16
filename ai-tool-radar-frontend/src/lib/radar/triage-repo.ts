import {
  applyTriageStatus as applyTriageMemory,
  countTriageForTenant as countTriageMemory,
  getTriageStatus as getTriageMemory,
  itemKey,
  setTriageStatus as setTriageMemory,
  type TriageStatus,
} from "@/lib/radar/triage-store";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

async function ensureTriageSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_triage_status (
      tenant_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, item_key)
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_triage_tenant_updated ON radar_triage_status(tenant_id, updated_at DESC)",
  );
}

async function postgresGetTriageStatus(tenantId: string, key: string): Promise<TriageStatus | undefined> {
  await ensureTriageSchema();
  const res = await getDbPool().query<{ status: TriageStatus }>(
    `
    SELECT status
    FROM radar_triage_status
    WHERE tenant_id = $1 AND item_key = $2
    LIMIT 1
    `,
    [tenantId, key],
  );
  return res.rows[0]?.status;
}

async function postgresSetTriageStatus(tenantId: string, key: string, status: TriageStatus): Promise<void> {
  await ensureTriageSchema();
  await getDbPool().query(
    `
    INSERT INTO radar_triage_status (tenant_id, item_key, status, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (tenant_id, item_key)
    DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
    `,
    [tenantId, key, status],
  );
}

async function postgresCountTriageForTenant(tenantId: string): Promise<number> {
  await ensureTriageSchema();
  const res = await getDbPool().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM radar_triage_status WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(res.rows[0]?.count || 0);
}

async function postgresApplyTriageStatus<T extends { id?: unknown; url?: unknown; title?: unknown }>(
  tenantId: string,
  rows: T[],
): Promise<Array<T & { triage_status?: TriageStatus }>> {
  await ensureTriageSchema();
  const keys = rows.map((row) => itemKey(row)).filter(Boolean);
  if (!keys.length) return rows as Array<T & { triage_status?: TriageStatus }>;
  const res = await getDbPool().query<{ item_key: string; status: TriageStatus }>(
    `
    SELECT item_key, status
    FROM radar_triage_status
    WHERE tenant_id = $1 AND item_key = ANY($2::text[])
    `,
    [tenantId, keys],
  );
  const byKey = new Map<string, TriageStatus>();
  for (const row of res.rows) byKey.set(row.item_key, row.status);
  return rows.map((row) => {
    const key = itemKey(row);
    if (!key) return row as T & { triage_status?: TriageStatus };
    const status = byKey.get(key);
    return status ? ({ ...row, triage_status: status } as T & { triage_status?: TriageStatus }) : (row as T & { triage_status?: TriageStatus });
  });
}

export async function getTriageStatusRepo(
  tenantId: string,
  key: string,
): Promise<TriageStatus | undefined> {
  if (!isPostgresEnabled()) return getTriageMemory(tenantId, key);
  try {
    return await postgresGetTriageStatus(tenantId, key);
  } catch {
    return getTriageMemory(tenantId, key);
  }
}

export async function setTriageStatusRepo(
  tenantId: string,
  key: string,
  status: TriageStatus,
): Promise<void> {
  if (!isPostgresEnabled()) {
    setTriageMemory(tenantId, key, status);
    return;
  }
  try {
    await postgresSetTriageStatus(tenantId, key, status);
  } catch {
    setTriageMemory(tenantId, key, status);
  }
}

export async function countTriageForTenantRepo(tenantId: string): Promise<number> {
  if (!isPostgresEnabled()) return countTriageMemory(tenantId);
  try {
    return await postgresCountTriageForTenant(tenantId);
  } catch {
    return countTriageMemory(tenantId);
  }
}

export async function applyTriageStatusRepo<T extends { id?: unknown; url?: unknown; title?: unknown }>(
  tenantId: string,
  rows: T[],
): Promise<Array<T & { triage_status?: TriageStatus }>> {
  if (!isPostgresEnabled()) return applyTriageMemory(tenantId, rows);
  try {
    return await postgresApplyTriageStatus(tenantId, rows);
  } catch {
    return applyTriageMemory(tenantId, rows);
  }
}
