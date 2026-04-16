export type TriageStatus = "new" | "testing" | "watch" | "adopted" | "ignored";

type TenantMap = Map<string, TriageStatus>;

const rootGlobal = globalThis as typeof globalThis & {
  __radarTriageStore?: Map<string, TenantMap>;
};

const store = rootGlobal.__radarTriageStore ?? new Map<string, TenantMap>();
rootGlobal.__radarTriageStore = store;

function ensureTenant(tenantId: string): TenantMap {
  const existing = store.get(tenantId);
  if (existing) return existing;
  const fresh: TenantMap = new Map<string, TriageStatus>();
  store.set(tenantId, fresh);
  return fresh;
}

export function getTriageStatus(tenantId: string, key: string): TriageStatus | undefined {
  return ensureTenant(tenantId).get(key);
}

export function setTriageStatus(tenantId: string, key: string, status: TriageStatus): void {
  ensureTenant(tenantId).set(key, status);
}

export function itemKey(item: { id?: unknown; url?: unknown; title?: unknown }): string {
  const id = typeof item.id === "string" && item.id ? item.id : "";
  const url = typeof item.url === "string" && item.url ? item.url : "";
  const title = typeof item.title === "string" && item.title ? item.title : "";
  return id || url || title;
}

export function countTriageForTenant(tenantId: string): number {
  const map = store.get(tenantId);
  return map ? map.size : 0;
}

export function applyTriageStatus<T extends { id?: unknown; url?: unknown; title?: unknown }>(
  tenantId: string,
  rows: T[],
): Array<T & { triage_status?: TriageStatus }> {
  return rows.map((row) => {
    const key = itemKey(row);
    if (!key) return row as T & { triage_status?: TriageStatus };
    const status = getTriageStatus(tenantId, key);
    return status ? ({ ...row, triage_status: status } as T & { triage_status?: TriageStatus }) : (row as T & { triage_status?: TriageStatus });
  });
}
