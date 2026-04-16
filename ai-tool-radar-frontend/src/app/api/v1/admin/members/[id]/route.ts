import { NextRequest, NextResponse } from "next/server";
import {
  requestId,
  requireAuth,
  type Role,
} from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { removeMemberFromTenantRepo, updateMemberRoleInTenantRepo } from "@/lib/auth/member-repo";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES: Role[] = ["user", "admin", "super_admin"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "member.update_role");
  if (!auth.ok) return auth.response;
  const p = await params;

  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 4 * 1024 });
    const role = asTrimmedString(body.role, 40) as Role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "role is invalid." }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }
    if (auth.session.role !== "super_admin" && role === "super_admin") {
      return NextResponse.json(
        {
          error: { code: "FORBIDDEN", message: "Only super_admin can assign super_admin role." },
          request_id: rid,
        },
        { status: 403, headers: { "X-Request-Id": rid } },
      );
    }
    const updated = await updateMemberRoleInTenantRepo({
      tenantId: auth.session.tenant_id,
      userId: p.id,
      role,
    });
    if (!updated) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Member not found." }, request_id: rid },
        { status: 404, headers: { "X-Request-Id": rid } },
      );
    }

    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "member.update_role",
      entity: "member",
      entity_id: p.id,
      metadata: { role },
    });

    return NextResponse.json(
      { data: { member: updated }, request_id: rid },
      { headers: { "X-Request-Id": rid } },
    );
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, request_id: rid },
        { status: err.status, headers: { "X-Request-Id": rid } },
      );
    }
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body." }, request_id: rid },
      { status: 400, headers: { "X-Request-Id": rid } },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "member.remove");
  if (!auth.ok) return auth.response;
  const p = await params;

  if (auth.session.user_id === p.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You cannot remove your own membership." }, request_id: rid },
      { status: 403, headers: { "X-Request-Id": rid } },
    );
  }

  const removed = await removeMemberFromTenantRepo({
    tenantId: auth.session.tenant_id,
    userId: p.id,
  });
  if (!removed.ok) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: removed.reason || "Member not found." }, request_id: rid },
      { status: 404, headers: { "X-Request-Id": rid } },
    );
  }

  await writeAudit({
    tenant_id: auth.session.tenant_id,
    actor_id: auth.session.user_id,
    action: "member.remove",
    entity: "member",
    entity_id: p.id,
    metadata: {},
  });

  return NextResponse.json(
    { data: { ok: true, user_id: p.id }, request_id: rid },
    { headers: { "X-Request-Id": rid } },
  );
}
