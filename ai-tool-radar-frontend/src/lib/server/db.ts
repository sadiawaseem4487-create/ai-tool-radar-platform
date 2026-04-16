import { Pool } from "pg";

const rootGlobal = globalThis as typeof globalThis & {
  __radarPgPool?: Pool;
};

function databaseUrl(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  return raw ? raw : null;
}

export function isPostgresEnabled(): boolean {
  return Boolean(databaseUrl());
}

function pool(): Pool {
  const existing = rootGlobal.__radarPgPool;
  if (existing) return existing;
  const url = databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  const created = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  rootGlobal.__radarPgPool = created;
  return created;
}

export function getDbPool(): Pool {
  return pool();
}

export function postgresPoolMetrics():
  | { enabled: false }
  | { enabled: true; total_connections: number; idle_connections: number; waiting_clients: number } {
  if (!isPostgresEnabled()) return { enabled: false };
  const p = pool();
  return {
    enabled: true,
    total_connections: p.totalCount,
    idle_connections: p.idleCount,
    waiting_clients: p.waitingCount,
  };
}

export async function pingPostgres(): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
  if (!isPostgresEnabled()) {
    return { ok: false, error: "DATABASE_URL is not configured" };
  }
  const start = Date.now();
  try {
    await pool().query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Postgres ping failed" };
  }
}
