import { getDbPool, isPostgresEnabled } from "@/lib/server/db";
import { fetchToolFeed, getToolId, toolScore, type ToolRow } from "@/lib/server/tools-feed";

type DbTool = {
  tool_id: string;
  lifecycle_status: string | null;
  is_recent: boolean | null;
  is_hot: boolean | null;
  is_discontinued: boolean | null;
  payload: ToolRow;
};

async function ensureToolsSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_tools (
      tool_id TEXT PRIMARY KEY,
      title TEXT,
      url TEXT,
      source TEXT,
      category TEXT,
      recommended_action TEXT,
      published_date TIMESTAMPTZ,
      final_score DOUBLE PRECISION,
      lifecycle_status TEXT,
      is_recent BOOLEAN NOT NULL DEFAULT FALSE,
      is_hot BOOLEAN NOT NULL DEFAULT FALSE,
      is_discontinued BOOLEAN NOT NULL DEFAULT FALSE,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(`
    ALTER TABLE radar_tools
      ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
      ADD COLUMN IF NOT EXISTS is_recent BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_discontinued BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_source ON radar_tools(source)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_category ON radar_tools(category)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_action ON radar_tools(recommended_action)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_score ON radar_tools(final_score DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_published ON radar_tools(published_date DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_lifecycle ON radar_tools(lifecycle_status, is_hot, is_recent, is_discontinued)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tools_updated ON radar_tools(updated_at DESC)",
  );
}

function asDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  return false;
}

function lifecycleFor(row: ToolRow): {
  lifecycle_status: "hot" | "recent" | "discontinued" | "stable";
  is_recent: boolean;
  is_hot: boolean;
  is_discontinued: boolean;
} {
  const score = toolScore(row);
  const publishedMs = new Date(String(row.published_date || "")).getTime();
  const ageMs = Number.isFinite(publishedMs) ? Date.now() - publishedMs : Number.MAX_SAFE_INTEGER;
  const isRecent = ageMs <= 14 * 24 * 60 * 60 * 1000;
  const rawLifecycle = String(row.lifecycle_status || row.lifecycle || row.status || "").trim().toLowerCase();
  const isDiscontinued =
    rawLifecycle === "discontinued" ||
    rawLifecycle === "deprecated" ||
    isTruthy(row.discontinued) ||
    isTruthy(row.is_discontinued);
  const isHot = !isDiscontinued && isRecent && score >= 8;
  const lifecycle_status: "hot" | "recent" | "discontinued" | "stable" = isDiscontinued
    ? "discontinued"
    : isHot
      ? "hot"
      : isRecent
        ? "recent"
        : "stable";
  return {
    lifecycle_status,
    is_recent: isRecent,
    is_hot: isHot,
    is_discontinued: isDiscontinued,
  };
}

function enrichRowLifecycle(row: ToolRow): ToolRow {
  const lf = lifecycleFor(row);
  return {
    ...row,
    lifecycle_status: lf.lifecycle_status,
    is_recent: lf.is_recent,
    is_hot: lf.is_hot,
    is_discontinued: lf.is_discontinued,
  };
}

async function upsertTools(rows: ToolRow[]): Promise<void> {
  await ensureToolsSchema();
  for (const row of rows) {
    const enriched = enrichRowLifecycle(row);
    const toolId = getToolId(row);
    if (!toolId) continue;
    const lf = lifecycleFor(enriched);
    await getDbPool().query(
      `
      INSERT INTO radar_tools (
        tool_id, title, url, source, category, recommended_action, published_date, final_score, lifecycle_status, is_recent, is_hot, is_discontinued, payload, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT (tool_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        recommended_action = EXCLUDED.recommended_action,
        published_date = EXCLUDED.published_date,
        final_score = EXCLUDED.final_score,
        lifecycle_status = EXCLUDED.lifecycle_status,
        is_recent = EXCLUDED.is_recent,
        is_hot = EXCLUDED.is_hot,
        is_discontinued = EXCLUDED.is_discontinued,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      `,
      [
        toolId,
        asText(enriched.title),
        asText(enriched.url),
        asText(enriched.source),
        asText(enriched.category),
        asText(enriched.recommended_action),
        asDateOrNull(enriched.published_date),
        toolScore(enriched),
        lf.lifecycle_status,
        lf.is_recent,
        lf.is_hot,
        lf.is_discontinued,
        enriched,
      ],
    );
  }
}

async function readAllToolsFromDb(): Promise<ToolRow[]> {
  await ensureToolsSchema();
  const res = await getDbPool().query<DbTool>(
    `
    SELECT tool_id, lifecycle_status, is_recent, is_hot, is_discontinued, payload
    FROM radar_tools
    ORDER BY COALESCE(published_date, to_timestamp(0)) DESC, updated_at DESC
    `,
  );
  return res.rows.map((row) => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    return {
      ...payload,
      id: (payload.id as string) || row.tool_id,
      lifecycle_status: (payload.lifecycle_status as string) || row.lifecycle_status || "stable",
      is_recent: typeof payload.is_recent === "boolean" ? payload.is_recent : Boolean(row.is_recent),
      is_hot: typeof payload.is_hot === "boolean" ? payload.is_hot : Boolean(row.is_hot),
      is_discontinued:
        typeof payload.is_discontinued === "boolean"
          ? payload.is_discontinued
          : Boolean(row.is_discontinued),
    } as ToolRow;
  });
}

async function readToolFromDbById(id: string): Promise<ToolRow | null> {
  await ensureToolsSchema();
  const res = await getDbPool().query<DbTool>(
    `
    SELECT tool_id, lifecycle_status, is_recent, is_hot, is_discontinued, payload
    FROM radar_tools
    WHERE
      tool_id = $1
      OR url = $1
      OR title = $1
      OR payload->>'id' = $1
      OR payload->>'url' = $1
      OR payload->>'title' = $1
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    ...payload,
    id: (payload.id as string) || row.tool_id,
    lifecycle_status: (payload.lifecycle_status as string) || row.lifecycle_status || "stable",
    is_recent: typeof payload.is_recent === "boolean" ? payload.is_recent : Boolean(row.is_recent),
    is_hot: typeof payload.is_hot === "boolean" ? payload.is_hot : Boolean(row.is_hot),
    is_discontinued:
      typeof payload.is_discontinued === "boolean" ? payload.is_discontinued : Boolean(row.is_discontinued),
  } as ToolRow;
}

export async function loadToolsDbFirst(): Promise<{ rows: ToolRow[]; source: "db" | "upstream" }> {
  if (!isPostgresEnabled()) {
    const feed = await fetchToolFeed();
    return { rows: feed.rows.map(enrichRowLifecycle), source: "upstream" };
  }
  try {
    const existing = await readAllToolsFromDb();
    if (existing.length > 0) return { rows: existing, source: "db" };
    const feed = await fetchToolFeed();
    await upsertTools(feed.rows);
    return { rows: feed.rows.map(enrichRowLifecycle), source: "upstream" };
  } catch {
    const feed = await fetchToolFeed();
    return { rows: feed.rows.map(enrichRowLifecycle), source: "upstream" };
  }
}

export async function loadToolByIdDbFirst(id: string): Promise<ToolRow | null> {
  if (!isPostgresEnabled()) {
    const feed = await fetchToolFeed();
    const row =
      feed.rows.find((r) => getToolId(r) === id || String(r.url || "") === id || String(r.title || "") === id) ||
      null;
    return row ? enrichRowLifecycle(row) : null;
  }
  try {
    const fromDb = await readToolFromDbById(id);
    if (fromDb) return fromDb;
    const feed = await fetchToolFeed();
    await upsertTools(feed.rows);
    const row =
      feed.rows.find((r) => getToolId(r) === id || String(r.url || "") === id || String(r.title || "") === id) ||
      null;
    return row ? enrichRowLifecycle(row) : null;
  } catch {
    const feed = await fetchToolFeed();
    const row =
      feed.rows.find((r) => getToolId(r) === id || String(r.url || "") === id || String(r.title || "") === id) ||
      null;
    return row ? enrichRowLifecycle(row) : null;
  }
}

export async function warmToolsFromUpstream(): Promise<{ inserted: number }> {
  const feed = await fetchToolFeed();
  if (!isPostgresEnabled()) return { inserted: 0 };
  await upsertTools(feed.rows);
  return { inserted: feed.rows.length };
}
