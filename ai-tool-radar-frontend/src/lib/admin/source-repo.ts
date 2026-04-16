import { getDbPool, isPostgresEnabled } from "@/lib/server/db";
import {
  listSources as listSourcesMemory,
  testSource as testSourceMemory,
  type SourceConfig,
  updateSource as updateSourceMemory,
} from "@/lib/admin/sources";

type SourcePatch = { enabled?: boolean; schedule_minutes?: number };

export type SourceRepository = {
  listSources(tenantId: string): Promise<SourceConfig[]>;
  updateSource(tenantId: string, id: string, patch: SourcePatch): Promise<SourceConfig | null>;
  testSource(
    tenantId: string,
    id: string,
  ): Promise<{ ok: boolean; source?: SourceConfig; error?: string }>;
};

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

async function ensurePostgresSourceSchema(): Promise<void> {
  const pool = getDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS radar_source_configs (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      schedule_minutes INTEGER NOT NULL DEFAULT 30,
      test_url TEXT NOT NULL,
      last_test_status TEXT,
      last_tested_at TIMESTAMPTZ,
      last_test_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, id)
    );
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_radar_source_configs_tenant_name ON radar_source_configs(tenant_id, name)",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_radar_source_configs_tenant_enabled ON radar_source_configs(tenant_id, enabled)",
  );
}

async function seedSourceDefaultsIfMissing(tenantId: string): Promise<void> {
  const pool = getDbPool();
  const countRes = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM radar_source_configs WHERE tenant_id = $1",
    [tenantId],
  );
  if (Number(countRes.rows[0]?.count || 0) > 0) return;
  for (const row of defaultSources(tenantId)) {
    await pool.query(
      `
      INSERT INTO radar_source_configs (id, tenant_id, name, enabled, schedule_minutes, test_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, id) DO NOTHING
      `,
      [row.id, row.tenant_id, row.name, row.enabled, row.schedule_minutes, row.test_url],
    );
  }
}

function toSourceConfig(row: {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  schedule_minutes: number;
  test_url: string;
  last_test_status: string | null;
  last_tested_at: string | null;
  last_test_error: string | null;
}): SourceConfig {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    enabled: row.enabled,
    schedule_minutes: row.schedule_minutes,
    test_url: row.test_url,
    last_test_status:
      row.last_test_status === "success" || row.last_test_status === "failed"
        ? row.last_test_status
        : undefined,
    last_tested_at: row.last_tested_at || undefined,
    last_test_error: row.last_test_error || undefined,
  };
}

const memoryRepo: SourceRepository = {
  async listSources(tenantId) {
    return listSourcesMemory(tenantId);
  },
  async updateSource(tenantId, id, patch) {
    return updateSourceMemory(tenantId, id, patch);
  },
  async testSource(tenantId, id) {
    return testSourceMemory(tenantId, id);
  },
};

const postgresRepo: SourceRepository = {
  async listSources(tenantId) {
    await ensurePostgresSourceSchema();
    await seedSourceDefaultsIfMissing(tenantId);
    const res = await getDbPool().query<{
      id: string;
      tenant_id: string;
      name: string;
      enabled: boolean;
      schedule_minutes: number;
      test_url: string;
      last_test_status: string | null;
      last_tested_at: string | null;
      last_test_error: string | null;
    }>(
      `
      SELECT id, tenant_id, name, enabled, schedule_minutes, test_url, last_test_status, last_tested_at, last_test_error
      FROM radar_source_configs
      WHERE tenant_id = $1
      ORDER BY name ASC
      `,
      [tenantId],
    );
    return res.rows.map(toSourceConfig);
  },
  async updateSource(tenantId, id, patch) {
    await ensurePostgresSourceSchema();
    await seedSourceDefaultsIfMissing(tenantId);
    const currentRes = await getDbPool().query<{
      id: string;
      tenant_id: string;
      name: string;
      enabled: boolean;
      schedule_minutes: number;
      test_url: string;
      last_test_status: string | null;
      last_tested_at: string | null;
      last_test_error: string | null;
    }>(
      `
      SELECT id, tenant_id, name, enabled, schedule_minutes, test_url, last_test_status, last_tested_at, last_test_error
      FROM radar_source_configs
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
      `,
      [tenantId, id],
    );
    const current = currentRes.rows[0];
    if (!current) return null;
    const schedule =
      typeof patch.schedule_minutes === "number" && Number.isFinite(patch.schedule_minutes)
        ? Math.max(5, Math.min(1440, Math.trunc(patch.schedule_minutes)))
        : current.schedule_minutes;
    const enabled = typeof patch.enabled === "boolean" ? patch.enabled : current.enabled;
    await getDbPool().query(
      `
      UPDATE radar_source_configs
      SET enabled = $3, schedule_minutes = $4, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, id, enabled, schedule],
    );
    return {
      ...toSourceConfig(current),
      enabled,
      schedule_minutes: schedule,
    };
  },
  async testSource(tenantId, id) {
    await ensurePostgresSourceSchema();
    await seedSourceDefaultsIfMissing(tenantId);
    const currentRes = await getDbPool().query<{
      id: string;
      tenant_id: string;
      name: string;
      enabled: boolean;
      schedule_minutes: number;
      test_url: string;
      last_test_status: string | null;
      last_tested_at: string | null;
      last_test_error: string | null;
    }>(
      `
      SELECT id, tenant_id, name, enabled, schedule_minutes, test_url, last_test_status, last_tested_at, last_test_error
      FROM radar_source_configs
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
      `,
      [tenantId, id],
    );
    const current = currentRes.rows[0];
    if (!current) return { ok: false, error: "Source not found." };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(current.test_url, {
        method: "GET",
        signal: ctrl.signal,
        headers: { Accept: "*/*" },
        cache: "no-store",
      });
      const ok = res.ok;
      const err = ok ? null : `HTTP ${res.status}`;
      await getDbPool().query(
        `
        UPDATE radar_source_configs
        SET last_test_status = $3, last_tested_at = NOW(), last_test_error = $4, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, id, ok ? "success" : "failed", err],
      );
      const source: SourceConfig = {
        ...toSourceConfig(current),
        last_test_status: ok ? "success" : "failed",
        last_tested_at: new Date().toISOString(),
        last_test_error: err || undefined,
      };
      return ok ? { ok: true, source } : { ok: false, source, error: source.last_test_error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      await getDbPool().query(
        `
        UPDATE radar_source_configs
        SET last_test_status = 'failed', last_tested_at = NOW(), last_test_error = $3, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, id, message],
      );
      const source: SourceConfig = {
        ...toSourceConfig(current),
        last_test_status: "failed",
        last_tested_at: new Date().toISOString(),
        last_test_error: message,
      };
      return { ok: false, source, error: message };
    } finally {
      clearTimeout(timer);
    }
  },
};

export function getSourceRepository(): SourceRepository {
  if (!isPostgresEnabled()) return memoryRepo;
  return {
    async listSources(tenantId) {
      try {
        return await postgresRepo.listSources(tenantId);
      } catch {
        return memoryRepo.listSources(tenantId);
      }
    },
    async updateSource(tenantId, id, patch) {
      try {
        return await postgresRepo.updateSource(tenantId, id, patch);
      } catch {
        return memoryRepo.updateSource(tenantId, id, patch);
      }
    },
    async testSource(tenantId, id) {
      try {
        return await postgresRepo.testSource(tenantId, id);
      } catch {
        return memoryRepo.testSource(tenantId, id);
      }
    },
  };
}
