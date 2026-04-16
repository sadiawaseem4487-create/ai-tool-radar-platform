import {
  authenticateUser as authenticateUserMemory,
  getAuthUsers,
  inviteMemberToTenant as inviteMemberMemory,
  listMembersForTenant as listMembersMemory,
  removeMemberFromTenant as removeMemberMemory,
  type AuthSession,
  type Role,
  updateMemberRoleInTenant as updateRoleMemory,
} from "@/lib/auth/session";
import { randomUUID } from "crypto";
import { getDbPool, isPostgresEnabled } from "@/lib/server/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type MemberView = {
  user_id: string;
  email: string;
  role: Role;
  tenant_id: string;
  memberships: string[];
};

const SESSION_TTL_SECONDS = 60 * 60 * 8;

async function ensureUsersSchema(): Promise<void> {
  await getDbPool().query(`
    CREATE TABLE IF NOT EXISTS radar_users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      memberships TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_users_role ON radar_users(role)",
  );
  await getDbPool().query(
    "CREATE INDEX IF NOT EXISTS idx_radar_users_tenant ON radar_users(tenant_id)",
  );
}

async function seedUsersIfEmpty(): Promise<void> {
  const countRes = await getDbPool().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM radar_users",
  );
  if (Number(countRes.rows[0]?.count || 0) > 0) return;
  const seed = getAuthUsers();
  for (const u of seed) {
    await getDbPool().query(
      `
      INSERT INTO radar_users (user_id, email, password, role, tenant_id, memberships)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [u.user_id, u.email, u.password, u.role, u.tenant_id, u.memberships],
    );
  }
}

async function postgresListMembers(tenantId: string): Promise<MemberView[]> {
  await ensureUsersSchema();
  await seedUsersIfEmpty();
  const res = await getDbPool().query<{
    user_id: string;
    email: string;
    role: Role;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    SELECT user_id, email, role, tenant_id, memberships
    FROM radar_users
    WHERE $1 = ANY(memberships)
    ORDER BY email ASC
    `,
    [tenantId],
  );
  return res.rows.map((r) => ({
    user_id: r.user_id,
    email: r.email,
    role: r.role,
    tenant_id: r.tenant_id,
    memberships: Array.isArray(r.memberships) ? r.memberships : [],
  }));
}

async function postgresAuthenticateUser(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  await ensureUsersSchema();
  await seedUsersIfEmpty();
  const normalized = email.trim().toLowerCase();
  const res = await getDbPool().query<{
    user_id: string;
    email: string;
    password: string;
    role: Role;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    SELECT user_id, email, password, role, tenant_id, memberships
    FROM radar_users
    WHERE email = $1
    LIMIT 1
    `,
    [normalized],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (!verifyPassword(row.password, password)) return null;
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    tenant_id: row.tenant_id,
    memberships: Array.isArray(row.memberships) ? row.memberships : [],
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

async function postgresUpdateRole(
  tenantId: string,
  userId: string,
  role: Role,
): Promise<MemberView | null> {
  await ensureUsersSchema();
  await seedUsersIfEmpty();
  const res = await getDbPool().query<{
    user_id: string;
    email: string;
    role: Role;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    UPDATE radar_users
    SET role = $3, updated_at = NOW()
    WHERE user_id = $2 AND $1 = ANY(memberships)
    RETURNING user_id, email, role, tenant_id, memberships
    `,
    [tenantId, userId, role],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    tenant_id: row.tenant_id,
    memberships: Array.isArray(row.memberships) ? row.memberships : [],
  };
}

async function postgresInviteMember(input: {
  email: string;
  role: Role;
  tenantId: string;
  password?: string;
}): Promise<MemberView> {
  await ensureUsersSchema();
  await seedUsersIfEmpty();
  const email = input.email.trim().toLowerCase();
  const password = hashPassword(input.password?.trim() || "changeme123");
  const existingRes = await getDbPool().query<{
    user_id: string;
    email: string;
    password: string;
    role: Role;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    SELECT user_id, email, password, role, tenant_id, memberships
    FROM radar_users
    WHERE email = $1
    LIMIT 1
    `,
    [email],
  );
  const existing = existingRes.rows[0];
  if (!existing) {
    const userId = `u_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const created = await getDbPool().query<{
      user_id: string;
      email: string;
      role: Role;
      tenant_id: string;
      memberships: string[];
    }>(
      `
      INSERT INTO radar_users (user_id, email, password, role, tenant_id, memberships, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING user_id, email, role, tenant_id, memberships
      `,
      [userId, email, password, input.role, input.tenantId, [input.tenantId]],
    );
    const row = created.rows[0];
    return {
      user_id: row.user_id,
      email: row.email,
      role: row.role,
      tenant_id: row.tenant_id,
      memberships: Array.isArray(row.memberships) ? row.memberships : [],
    };
  }
  const memberships = Array.isArray(existing.memberships) ? existing.memberships : [];
  const nextMemberships = memberships.includes(input.tenantId)
    ? memberships
    : [...memberships, input.tenantId];
  const updated = await getDbPool().query<{
    user_id: string;
    email: string;
    role: Role;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    UPDATE radar_users
    SET
      memberships = $2,
      role = $3,
      password = COALESCE($4, password),
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, email, role, tenant_id, memberships
    `,
    [
      existing.user_id,
      nextMemberships,
      input.role,
      input.password?.trim() ? hashPassword(input.password.trim()) : null,
    ],
  );
  const row = updated.rows[0];
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    tenant_id: row.tenant_id,
    memberships: Array.isArray(row.memberships) ? row.memberships : [],
  };
}

async function postgresRemoveMember(
  tenantId: string,
  userId: string,
): Promise<{ ok: boolean; removed_user_id?: string; reason?: string }> {
  await ensureUsersSchema();
  await seedUsersIfEmpty();
  const read = await getDbPool().query<{
    user_id: string;
    tenant_id: string;
    memberships: string[];
  }>(
    `
    SELECT user_id, tenant_id, memberships
    FROM radar_users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const current = read.rows[0];
  if (!current) return { ok: false, reason: "Member not found." };
  const memberships = Array.isArray(current.memberships) ? current.memberships : [];
  if (!memberships.includes(tenantId)) return { ok: false, reason: "Member is not in this tenant." };
  const nextMemberships = memberships.filter((t) => t !== tenantId);
  const nextTenantId =
    current.tenant_id === tenantId ? nextMemberships[0] || current.tenant_id : current.tenant_id;
  await getDbPool().query(
    `
    UPDATE radar_users
    SET memberships = $2, tenant_id = $3, updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, nextMemberships, nextTenantId],
  );
  return { ok: true, removed_user_id: userId };
}

export async function listMembersForTenantRepo(tenantId: string): Promise<MemberView[]> {
  if (!isPostgresEnabled()) return listMembersMemory(tenantId);
  try {
    return await postgresListMembers(tenantId);
  } catch {
    return listMembersMemory(tenantId);
  }
}

export async function updateMemberRoleInTenantRepo(input: {
  tenantId: string;
  userId: string;
  role: Role;
}): Promise<MemberView | null> {
  if (!isPostgresEnabled()) return updateRoleMemory(input);
  try {
    return await postgresUpdateRole(input.tenantId, input.userId, input.role);
  } catch {
    return updateRoleMemory(input);
  }
}

export async function removeMemberFromTenantRepo(input: {
  tenantId: string;
  userId: string;
}): Promise<{ ok: boolean; removed_user_id?: string; reason?: string }> {
  if (!isPostgresEnabled()) return removeMemberMemory(input);
  try {
    return await postgresRemoveMember(input.tenantId, input.userId);
  } catch {
    return removeMemberMemory(input);
  }
}

export async function authenticateUserRepo(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  if (!isPostgresEnabled()) return authenticateUserMemory(email, password);
  try {
    return await postgresAuthenticateUser(email, password);
  } catch {
    return authenticateUserMemory(email, password);
  }
}

export async function inviteMemberToTenantRepo(input: {
  email: string;
  role: Role;
  tenantId: string;
  password?: string;
}): Promise<MemberView> {
  if (!isPostgresEnabled()) return inviteMemberMemory(input);
  try {
    return await postgresInviteMember(input);
  } catch {
    return inviteMemberMemory(input);
  }
}
