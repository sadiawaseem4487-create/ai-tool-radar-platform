import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type Role = "super_admin" | "admin" | "user";

export type Permission =
  | "tenant.read"
  | "tenant.update"
  | "member.invite"
  | "member.update_role"
  | "member.remove"
  | "tool.read"
  | "tool.update_triage"
  | "tool.delete"
  | "source.read"
  | "source.update"
  | "ingest.write"
  | "audit.read";

export type AuthSession = {
  user_id: string;
  email: string;
  role: Role;
  tenant_id: string;
  memberships: string[];
  exp: number;
  iat?: number;
  sid?: string;
};

export type AuthUser = {
  user_id: string;
  email: string;
  password: string;
  role: Role;
  tenant_id: string;
  memberships: string[];
};

type LoginAttempt = {
  firstAtMs: number;
  count: number;
};

const COOKIE_NAME = "radar_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  super_admin: new Set<Permission>([
    "tenant.read",
    "tenant.update",
    "member.invite",
    "member.update_role",
    "member.remove",
    "tool.read",
    "tool.update_triage",
    "tool.delete",
    "source.read",
    "source.update",
    "ingest.write",
    "audit.read",
  ]),
  admin: new Set<Permission>([
    "tenant.read",
    "tenant.update",
    "member.invite",
    "member.update_role",
    "member.remove",
    "tool.read",
    "tool.update_triage",
    "tool.delete",
    "source.read",
    "source.update",
    "ingest.write",
    "audit.read",
  ]),
  user: new Set<Permission>(["tenant.read", "tool.read", "tool.update_triage"]),
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarLoginAttempts?: Map<string, LoginAttempt>;
  __radarAuthUsers?: AuthUser[];
};

const loginAttempts = rootGlobal.__radarLoginAttempts ?? new Map<string, LoginAttempt>();
rootGlobal.__radarLoginAttempts = loginAttempts;

function sessionSecret(): string {
  return process.env.RADAR_SESSION_SECRET || "dev-only-change-me";
}

function sessionTtlSeconds(): number {
  const n = Number(process.env.RADAR_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_SESSION_TTL_SECONDS;
}

function sessionAbsoluteTtlSeconds(): number {
  const fallback = 60 * 60 * 24;
  const n = Number(process.env.RADAR_SESSION_ABSOLUTE_TTL_SECONDS || fallback);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function sessionRotateWindowSeconds(): number {
  const fallback = 60 * 15;
  const n = Number(process.env.RADAR_SESSION_ROTATE_WINDOW_SECONDS || fallback);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function shouldUseSecureCookie(): boolean {
  const mode = (process.env.RADAR_COOKIE_SECURE || "auto").trim().toLowerCase();
  if (mode === "true") return true;
  if (mode === "false") return false;
  return process.env.NODE_ENV === "production";
}

function normalizeSession(session: AuthSession): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  const iat = typeof session.iat === "number" && session.iat > 0 ? session.iat : now;
  const sid = typeof session.sid === "string" && session.sid ? session.sid : `sid_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const exp =
    typeof session.exp === "number" && session.exp > now
      ? session.exp
      : now + sessionTtlSeconds();
  return { ...session, iat, sid, exp };
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLen), "base64");
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payloadB64: string): string {
  return toBase64Url(createHmac("sha256", sessionSecret()).update(payloadB64).digest());
}

function parseUsersFromEnv(): AuthUser[] | null {
  const raw = process.env.RADAR_AUTH_USERS_JSON;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const users = parsed.filter(Boolean) as Partial<AuthUser>[];
    const valid = users
      .filter(
        (u) =>
          typeof u.email === "string" &&
          typeof u.password === "string" &&
          typeof u.role === "string" &&
          typeof u.tenant_id === "string",
      )
      .map((u, idx) => ({
        user_id: typeof u.user_id === "string" ? u.user_id : `u_env_${idx + 1}`,
        email: (u.email || "").toLowerCase(),
        password: u.password || "",
        role: u.role as Role,
        tenant_id: u.tenant_id || "tenant_default",
        memberships:
          Array.isArray(u.memberships) && u.memberships.every((m) => typeof m === "string")
            ? (u.memberships as string[])
            : [u.tenant_id || "tenant_default"],
      }));
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

function defaultUsers(): AuthUser[] {
  return [
    {
      user_id: "u_super_1",
      email: "super@radar.local",
      password: "super123",
      role: "super_admin",
      tenant_id: "tenant_default",
      memberships: ["tenant_default"],
    },
    {
      user_id: "u_admin_1",
      email: "admin@radar.local",
      password: "admin123",
      role: "admin",
      tenant_id: "tenant_default",
      memberships: ["tenant_default"],
    },
    {
      user_id: "u_user_1",
      email: "user@radar.local",
      password: "user123",
      role: "user",
      tenant_id: "tenant_default",
      memberships: ["tenant_default"],
    },
  ];
}

function ensureUsers(): AuthUser[] {
  if (!rootGlobal.__radarAuthUsers) {
    rootGlobal.__radarAuthUsers = parseUsersFromEnv() || defaultUsers();
  }
  return rootGlobal.__radarAuthUsers;
}

export function getAuthUsers(): AuthUser[] {
  return ensureUsers();
}

function loginWindowSeconds(): number {
  const n = Number(process.env.RADAR_LOGIN_WINDOW_SECONDS || 900);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

function maxLoginAttempts(): number {
  const n = Number(process.env.RADAR_LOGIN_MAX_ATTEMPTS || 5);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function loginKey(email: string, ip: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

function cleanupLoginAttempts(currentMs: number): void {
  const windowMs = loginWindowSeconds() * 1000;
  for (const [key, entry] of loginAttempts.entries()) {
    if (currentMs - entry.firstAtMs > windowMs) {
      loginAttempts.delete(key);
    }
  }
}

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff?.trim()) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function checkLoginRateLimit(email: string, ip: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const current = Date.now();
  cleanupLoginAttempts(current);

  const key = loginKey(email, ip);
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };

  const limit = maxLoginAttempts();
  if (entry.count < limit) return { allowed: true, retryAfterSeconds: 0 };

  const windowMs = loginWindowSeconds() * 1000;
  const elapsed = current - entry.firstAtMs;
  const remainingMs = Math.max(0, windowMs - elapsed);
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil(remainingMs / 1000),
  };
}

export function recordFailedLogin(email: string, ip: string): void {
  const key = loginKey(email, ip);
  const current = Date.now();
  const windowMs = loginWindowSeconds() * 1000;
  const existing = loginAttempts.get(key);

  if (!existing || current - existing.firstAtMs > windowMs) {
    loginAttempts.set(key, { firstAtMs: current, count: 1 });
    return;
  }

  existing.count += 1;
  loginAttempts.set(key, existing);
}

export function clearLoginAttempts(email: string, ip: string): void {
  loginAttempts.delete(loginKey(email, ip));
}

export function authenticateUser(email: string, password: string): AuthSession | null {
  const normalized = email.trim().toLowerCase();
  const user = getAuthUsers().find((u) => u.email === normalized);
  if (!user) return null;
  if (!verifyPassword(user.password, password)) return null;

  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    memberships: user.memberships,
    iat: now,
    sid: `sid_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    exp: now + sessionTtlSeconds(),
  };
}

export function listMembersForTenant(tenantId: string): Array<
  Pick<AuthUser, "user_id" | "email" | "role" | "tenant_id" | "memberships">
> {
  return getAuthUsers()
    .filter((u) => u.memberships.includes(tenantId))
    .map((u) => ({
      user_id: u.user_id,
      email: u.email,
      role: u.role,
      tenant_id: u.tenant_id,
      memberships: u.memberships,
    }));
}

export function inviteMemberToTenant(input: {
  email: string;
  role: Role;
  tenantId: string;
  password?: string;
}) {
  const users = ensureUsers();
  const email = input.email.trim().toLowerCase();
  let user = users.find((u) => u.email === email);
  const rawPassword = input.password?.trim() || "changeme123";
  const password = hashPassword(rawPassword);

  if (!user) {
    user = {
      user_id: `u_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      email,
      password,
      role: input.role,
      tenant_id: input.tenantId,
      memberships: [input.tenantId],
    };
    users.push(user);
  } else {
    if (!user.memberships.includes(input.tenantId)) {
      user.memberships.push(input.tenantId);
    }
    user.role = input.role;
    if (input.password?.trim()) {
      user.password = hashPassword(input.password.trim());
    }
  }

  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    memberships: user.memberships,
  };
}

export function updateMemberRoleInTenant(input: {
  tenantId: string;
  userId: string;
  role: Role;
}): Pick<AuthUser, "user_id" | "email" | "role" | "tenant_id" | "memberships"> | null {
  const users = ensureUsers();
  const user = users.find((u) => u.user_id === input.userId);
  if (!user) return null;
  if (!user.memberships.includes(input.tenantId)) return null;
  user.role = input.role;
  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    memberships: user.memberships,
  };
}

export function removeMemberFromTenant(input: {
  tenantId: string;
  userId: string;
}): { ok: boolean; removed_user_id?: string; reason?: string } {
  const users = ensureUsers();
  const user = users.find((u) => u.user_id === input.userId);
  if (!user) return { ok: false, reason: "Member not found." };
  if (!user.memberships.includes(input.tenantId)) {
    return { ok: false, reason: "Member is not in this tenant." };
  }
  user.memberships = user.memberships.filter((t) => t !== input.tenantId);
  if (user.tenant_id === input.tenantId) {
    user.tenant_id = user.memberships[0] || user.tenant_id;
  }
  return { ok: true, removed_user_id: user.user_id };
}

export function encodeSession(session: AuthSession): string {
  const payloadB64 = toBase64Url(JSON.stringify(session));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function decodeSession(token: string | undefined): AuthSession | null {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as AuthSession;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) {
      return null;
    }
    if (!payload.user_id || !payload.email || !payload.role || !payload.tenant_id) return null;
    const normalized = normalizeSession(payload);
    if (normalized.iat && now - normalized.iat > sessionAbsoluteTtlSeconds()) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest): AuthSession | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return decodeSession(token);
}

export function setSessionCookie(res: NextResponse, session: AuthSession): void {
  const normalized = normalizeSession(session);
  const token = encodeSession(normalized);
  const maxAge = Math.max(1, normalized.exp - Math.floor(Date.now() / 1000));
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function shouldRotateSession(session: AuthSession): boolean {
  const now = Math.floor(Date.now() / 1000);
  const left = session.exp - now;
  return left <= sessionRotateWindowSeconds();
}

export function refreshSession(session: AuthSession): AuthSession {
  const normalized = normalizeSession(session);
  const now = Math.floor(Date.now() / 1000);
  return {
    ...normalized,
    exp: now + sessionTtlSeconds(),
  };
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function authRequired(): boolean {
  return process.env.RADAR_REQUIRE_AUTH === "true";
}

export function requestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  rid: string,
): NextResponse<{ error: { code: string; message: string }; request_id: string }> {
  return NextResponse.json(
    { error: { code, message }, request_id: rid },
    { status, headers: { "X-Request-Id": rid } },
  );
}

export function requireAuth(req: NextRequest, rid: string, permission?: Permission) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return { ok: false as const, response: jsonError(401, "UNAUTHORIZED", "Login required.", rid) };
  }
  if (permission && !can(session.role, permission)) {
    return {
      ok: false as const,
      response: jsonError(403, "FORBIDDEN", "Missing required permission.", rid),
    };
  }
  return { ok: true as const, session };
}
