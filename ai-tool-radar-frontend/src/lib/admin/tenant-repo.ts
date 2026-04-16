import { getTenantSettings as getTenantSettingsMemory, updateTenantSettings as updateTenantSettingsMemory } from "@/lib/admin/tenant";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

export type TenantSettings = {
  tenant_id: string;
  display_name: string;
  timezone: string;
  status: "active" | "suspended";
  updated_at: string;
};

function sanitizePatch(patch: {
  display_name?: string;
  timezone?: string;
  status?: "active" | "suspended";
}) {
  return {
    display_name:
      typeof patch.display_name === "string" && patch.display_name.trim()
        ? patch.display_name.trim().slice(0, 120)
        : undefined,
    timezone:
      typeof patch.timezone === "string" && patch.timezone.trim()
        ? patch.timezone.trim().slice(0, 80)
        : undefined,
    status: patch.status,
  };
}

function defaultTenant(tenantId: string): TenantSettings {
  return {
    tenant_id: tenantId,
    display_name: tenantId === "tenant_default" ? "Default Company" : tenantId,
    timezone: "UTC",
    status: "active",
    updated_at: new Date().toISOString(),
  };
}

async function ensureTenantSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_tenants (
      tenant_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function seedTenantIfMissing(tenantId: string): Promise<void> {
  const seed = defaultTenant(tenantId);
  await getDbPool().query(
    `
    INSERT INTO radar_tenants (tenant_id, display_name, timezone, status, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (tenant_id) DO NOTHING
    `,
    [seed.tenant_id, seed.display_name, seed.timezone, seed.status],
  );
}

async function postgresGetTenantSettings(tenantId: string): Promise<TenantSettings> {
  await ensureTenantSchema();
  await seedTenantIfMissing(tenantId);
  const res = await getDbPool().query<{
    tenant_id: string;
    display_name: string;
    timezone: string;
    status: "active" | "suspended";
    updated_at: string;
  }>(
    `
    SELECT tenant_id, display_name, timezone, status, updated_at::text
    FROM radar_tenants
    WHERE tenant_id = $1
    LIMIT 1
    `,
    [tenantId],
  );
  const row = res.rows[0];
  if (!row) return defaultTenant(tenantId);
  return {
    tenant_id: row.tenant_id,
    display_name: row.display_name,
    timezone: row.timezone,
    status: row.status,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

async function postgresUpdateTenantSettings(
  tenantId: string,
  patch: { display_name?: string; timezone?: string; status?: "active" | "suspended" },
): Promise<TenantSettings> {
  await ensureTenantSchema();
  await seedTenantIfMissing(tenantId);
  const clean = sanitizePatch(patch);
  const res = await getDbPool().query<{
    tenant_id: string;
    display_name: string;
    timezone: string;
    status: "active" | "suspended";
    updated_at: string;
  }>(
    `
    UPDATE radar_tenants
    SET
      display_name = COALESCE($2, display_name),
      timezone = COALESCE($3, timezone),
      status = COALESCE($4, status),
      updated_at = NOW()
    WHERE tenant_id = $1
    RETURNING tenant_id, display_name, timezone, status, updated_at::text
    `,
    [tenantId, clean.display_name ?? null, clean.timezone ?? null, clean.status ?? null],
  );
  const row = res.rows[0];
  if (!row) return defaultTenant(tenantId);
  return {
    tenant_id: row.tenant_id,
    display_name: row.display_name,
    timezone: row.timezone,
    status: row.status,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export async function getTenantSettingsRepo(tenantId: string): Promise<TenantSettings> {
  if (!isPostgresEnabled()) return getTenantSettingsMemory(tenantId);
  try {
    return await postgresGetTenantSettings(tenantId);
  } catch {
    return getTenantSettingsMemory(tenantId);
  }
}

export async function updateTenantSettingsRepo(
  tenantId: string,
  patch: { display_name?: string; timezone?: string; status?: "active" | "suspended" },
): Promise<TenantSettings> {
  if (!isPostgresEnabled()) return updateTenantSettingsMemory(tenantId, patch);
  try {
    return await postgresUpdateTenantSettings(tenantId, patch);
  } catch {
    return updateTenantSettingsMemory(tenantId, patch);
  }
}
