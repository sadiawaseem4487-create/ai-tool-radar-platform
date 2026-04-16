import { randomUUID } from "crypto";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";

export type ToolComment = {
  id: string;
  tenant_id: string;
  tool_key: string;
  actor_id: string;
  author_email?: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarToolComments?: ToolComment[];
};

const memoryStore = rootGlobal.__radarToolComments ?? [];
rootGlobal.__radarToolComments = memoryStore;

async function ensureCommentsSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_tool_comments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      tool_key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      author_email TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tool_comments_tenant_tool_created ON radar_tool_comments(tenant_id, tool_key, created_at DESC)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_tool_comments_tenant_actor_created ON radar_tool_comments(tenant_id, actor_id, created_at DESC)",
  );
}

function memoryListComments(tenantId: string, toolKey: string): ToolComment[] {
  return memoryStore
    .filter((x) => x.tenant_id === tenantId && x.tool_key === toolKey)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function memoryListCommentedToolKeys(tenantId: string): string[] {
  return Array.from(new Set(memoryStore.filter((x) => x.tenant_id === tenantId).map((x) => x.tool_key)));
}

function memoryCreateComment(input: {
  tenant_id: string;
  tool_key: string;
  actor_id: string;
  author_email?: string;
  body: string;
}): ToolComment {
  const now = new Date().toISOString();
  const row: ToolComment = {
    id: `cmt_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    tenant_id: input.tenant_id,
    tool_key: input.tool_key,
    actor_id: input.actor_id,
    author_email: input.author_email,
    body: input.body,
    created_at: now,
    updated_at: now,
  };
  memoryStore.unshift(row);
  return row;
}

function memoryDeleteComment(input: {
  tenant_id: string;
  tool_key: string;
  comment_id: string;
  actor_id: string;
  allow_any: boolean;
}): { ok: boolean; reason?: string } {
  const idx = memoryStore.findIndex(
    (x) =>
      x.id === input.comment_id &&
      x.tenant_id === input.tenant_id &&
      x.tool_key === input.tool_key &&
      (input.allow_any || x.actor_id === input.actor_id),
  );
  if (idx < 0) return { ok: false, reason: "Comment not found." };
  memoryStore.splice(idx, 1);
  return { ok: true };
}

async function postgresListComments(tenantId: string, toolKey: string): Promise<ToolComment[]> {
  await ensureCommentsSchema();
  const res = await getDbPool().query<ToolComment>(
    `
    SELECT id, tenant_id, tool_key, actor_id, author_email, body, created_at::text, updated_at::text
    FROM radar_tool_comments
    WHERE tenant_id = $1 AND tool_key = $2
    ORDER BY created_at DESC
    `,
    [tenantId, toolKey],
  );
  return res.rows;
}

async function postgresListCommentedToolKeys(tenantId: string): Promise<string[]> {
  await ensureCommentsSchema();
  const res = await getDbPool().query<{ tool_key: string }>(
    `
    SELECT DISTINCT tool_key
    FROM radar_tool_comments
    WHERE tenant_id = $1
    `,
    [tenantId],
  );
  return res.rows.map((r) => r.tool_key);
}

async function postgresCreateComment(input: {
  tenant_id: string;
  tool_key: string;
  actor_id: string;
  author_email?: string;
  body: string;
}): Promise<ToolComment> {
  await ensureCommentsSchema();
  const id = `cmt_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const res = await getDbPool().query<ToolComment>(
    `
    INSERT INTO radar_tool_comments (id, tenant_id, tool_key, actor_id, author_email, body, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
    RETURNING id, tenant_id, tool_key, actor_id, author_email, body, created_at::text, updated_at::text
    `,
    [id, input.tenant_id, input.tool_key, input.actor_id, input.author_email || null, input.body],
  );
  return res.rows[0];
}

async function postgresDeleteComment(input: {
  tenant_id: string;
  tool_key: string;
  comment_id: string;
  actor_id: string;
  allow_any: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  await ensureCommentsSchema();
  const res = await getDbPool().query(
    `
    DELETE FROM radar_tool_comments
    WHERE id = $1
      AND tenant_id = $2
      AND tool_key = $3
      AND ($4::boolean = true OR actor_id = $5)
    `,
    [input.comment_id, input.tenant_id, input.tool_key, input.allow_any, input.actor_id],
  );
  if ((res.rowCount || 0) < 1) return { ok: false, reason: "Comment not found." };
  return { ok: true };
}

export async function listToolCommentsRepo(tenantId: string, toolKey: string): Promise<ToolComment[]> {
  if (!isPostgresEnabled()) return memoryListComments(tenantId, toolKey);
  try {
    return await postgresListComments(tenantId, toolKey);
  } catch {
    return memoryListComments(tenantId, toolKey);
  }
}

export async function createToolCommentRepo(input: {
  tenant_id: string;
  tool_key: string;
  actor_id: string;
  author_email?: string;
  body: string;
}): Promise<ToolComment> {
  if (!isPostgresEnabled()) return memoryCreateComment(input);
  try {
    return await postgresCreateComment(input);
  } catch {
    return memoryCreateComment(input);
  }
}

export async function deleteToolCommentRepo(input: {
  tenant_id: string;
  tool_key: string;
  comment_id: string;
  actor_id: string;
  allow_any: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!isPostgresEnabled()) return memoryDeleteComment(input);
  try {
    return await postgresDeleteComment(input);
  } catch {
    return memoryDeleteComment(input);
  }
}

export async function listCommentedToolKeysRepo(tenantId: string): Promise<Set<string>> {
  if (!isPostgresEnabled()) return new Set(memoryListCommentedToolKeys(tenantId));
  try {
    return new Set(await postgresListCommentedToolKeys(tenantId));
  } catch {
    return new Set(memoryListCommentedToolKeys(tenantId));
  }
}
