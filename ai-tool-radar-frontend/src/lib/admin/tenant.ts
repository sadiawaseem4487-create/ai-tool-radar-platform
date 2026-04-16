export type TenantSettings = {
  tenant_id: string;
  display_name: string;
  timezone: string;
  status: "active" | "suspended";
  updated_at: string;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarTenantSettings?: Map<string, TenantSettings>;
};

const store = rootGlobal.__radarTenantSettings ?? new Map<string, TenantSettings>();
rootGlobal.__radarTenantSettings = store;

function defaultTenant(tenantId: string): TenantSettings {
  return {
    tenant_id: tenantId,
    display_name: tenantId === "tenant_default" ? "Default Company" : tenantId,
    timezone: "UTC",
    status: "active",
    updated_at: new Date().toISOString(),
  };
}

export function getTenantSettings(tenantId: string): TenantSettings {
  const existing = store.get(tenantId);
  if (existing) return existing;
  const created = defaultTenant(tenantId);
  store.set(tenantId, created);
  return created;
}

export function updateTenantSettings(
  tenantId: string,
  patch: { display_name?: string; timezone?: string; status?: "active" | "suspended" },
): TenantSettings {
  const current = getTenantSettings(tenantId);
  const updated: TenantSettings = {
    ...current,
    display_name:
      typeof patch.display_name === "string" && patch.display_name.trim()
        ? patch.display_name.trim().slice(0, 120)
        : current.display_name,
    timezone:
      typeof patch.timezone === "string" && patch.timezone.trim()
        ? patch.timezone.trim().slice(0, 80)
        : current.timezone,
    status: patch.status || current.status,
    updated_at: new Date().toISOString(),
  };
  store.set(tenantId, updated);
  return updated;
}
