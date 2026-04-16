export type SourceConfig = {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  schedule_minutes: number;
  test_url: string;
  last_test_status?: "success" | "failed";
  last_tested_at?: string;
  last_test_error?: string;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarSourceConfigs?: Map<string, Map<string, SourceConfig>>;
};

const store = rootGlobal.__radarSourceConfigs ?? new Map<string, Map<string, SourceConfig>>();
rootGlobal.__radarSourceConfigs = store;

function defaultSources(tenantId: string): SourceConfig[] {
  return [
    {
      id: "github",
      tenant_id: tenantId,
      name: "GitHub",
      enabled: true,
      schedule_minutes: 30,
      test_url: "https://api.github.com",
    },
    {
      id: "hackernews",
      tenant_id: tenantId,
      name: "Hacker News",
      enabled: true,
      schedule_minutes: 30,
      test_url: "https://hacker-news.firebaseio.com/v0/maxitem.json",
    },
    {
      id: "producthunt",
      tenant_id: tenantId,
      name: "Product Hunt",
      enabled: true,
      schedule_minutes: 60,
      test_url: "https://www.producthunt.com",
    },
    {
      id: "arxiv",
      tenant_id: tenantId,
      name: "arXiv",
      enabled: true,
      schedule_minutes: 120,
      test_url: "https://export.arxiv.org/api/query?search_query=all:ai&start=0&max_results=1",
    },
  ];
}

function tenantMap(tenantId: string): Map<string, SourceConfig> {
  const existing = store.get(tenantId);
  if (existing) return existing;
  const map = new Map<string, SourceConfig>();
  for (const source of defaultSources(tenantId)) {
    map.set(source.id, source);
  }
  store.set(tenantId, map);
  return map;
}

export function listSources(tenantId: string): SourceConfig[] {
  return Array.from(tenantMap(tenantId).values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function updateSource(
  tenantId: string,
  id: string,
  patch: { enabled?: boolean; schedule_minutes?: number },
): SourceConfig | null {
  const row = tenantMap(tenantId).get(id);
  if (!row) return null;
  const schedule =
    typeof patch.schedule_minutes === "number" && Number.isFinite(patch.schedule_minutes)
      ? Math.max(5, Math.min(1440, Math.trunc(patch.schedule_minutes)))
      : row.schedule_minutes;
  const updated: SourceConfig = {
    ...row,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : row.enabled,
    schedule_minutes: schedule,
  };
  tenantMap(tenantId).set(id, updated);
  return updated;
}

export async function testSource(
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; source?: SourceConfig; error?: string }> {
  const row = tenantMap(tenantId).get(id);
  if (!row) return { ok: false, error: "Source not found." };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(row.test_url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Accept: "*/*" },
      cache: "no-store",
    });
    const ok = res.ok;
    const updated: SourceConfig = {
      ...row,
      last_test_status: ok ? "success" : "failed",
      last_tested_at: new Date().toISOString(),
      last_test_error: ok ? undefined : `HTTP ${res.status}`,
    };
    tenantMap(tenantId).set(id, updated);
    if (!ok) return { ok: false, source: updated, error: updated.last_test_error };
    return { ok: true, source: updated };
  } catch (err) {
    const updated: SourceConfig = {
      ...row,
      last_test_status: "failed",
      last_tested_at: new Date().toISOString(),
      last_test_error: err instanceof Error ? err.message : "Connection failed",
    };
    tenantMap(tenantId).set(id, updated);
    return { ok: false, source: updated, error: updated.last_test_error };
  } finally {
    clearTimeout(timer);
  }
}
