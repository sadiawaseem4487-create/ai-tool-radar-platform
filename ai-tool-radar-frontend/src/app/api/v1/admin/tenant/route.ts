import { NextRequest, NextResponse } from "next/server";
import { getTenantSettingsRepo, updateTenantSettingsRepo } from "@/lib/admin/tenant-repo";
import { requestId, requireAuth } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import {
  asTrimmedString,
  parseJsonWithLimit,
  RequestValidationError,
} from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "tenant.read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      data: await getTenantSettingsRepo(auth.session.tenant_id),
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}

export async function PATCH(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "tenant.update");
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 8 * 1024 });
    const statusRaw = asTrimmedString(body.status, 20);
    const status =
      statusRaw === "active" || statusRaw === "suspended" ? (statusRaw as "active" | "suspended") : undefined;
    const updated = await updateTenantSettingsRepo(auth.session.tenant_id, {
      display_name: asTrimmedString(body.display_name, 120) || undefined,
      timezone: asTrimmedString(body.timezone, 80) || undefined,
      status,
    });

    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "tenant.update",
      entity: "tenant",
      entity_id: auth.session.tenant_id,
      metadata: {
        display_name: updated.display_name,
        timezone: updated.timezone,
        status: updated.status,
      },
    });

    return NextResponse.json(
      { data: updated, request_id: rid },
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
