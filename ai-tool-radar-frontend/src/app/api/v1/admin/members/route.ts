import { NextRequest, NextResponse } from "next/server";
import { requestId, requireAuth, type Role } from "@/lib/auth/session";
import { inviteMemberToTenantRepo, listMembersForTenantRepo } from "@/lib/auth/member-repo";
import { writeAudit } from "@/lib/auth/audit";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";
const ALLOWED_ROLES: Role[] = ["user", "admin", "super_admin"];

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "member.invite");
  if (!auth.ok) return auth.response;

  const members = await listMembersForTenantRepo(auth.session.tenant_id);

  return NextResponse.json(
    {
      data: {
        tenant_id: auth.session.tenant_id,
        members,
      },
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "member.invite");
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 8 * 1024 });
    const email = asTrimmedString(body.email, 320).toLowerCase();
    const role = asTrimmedString(body.role, 40) as Role;
    if (!email) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "email is required." }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }
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

    const invited = await inviteMemberToTenantRepo({
      email,
      role,
      tenantId: auth.session.tenant_id,
      password: asTrimmedString(body.password, 200) || undefined,
    });

    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "member.invite",
      entity: "member",
      entity_id: invited.user_id,
      metadata: { email: invited.email, role: invited.role },
    });

    return NextResponse.json(
      { data: { member: invited }, request_id: rid },
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
