import { NextRequest, NextResponse } from "next/server";
import { getSourceRepository } from "@/lib/admin/source-repo";
import { requestId, requireAuth } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import {
  asOptionalBoolean,
  asOptionalNumber,
  asTrimmedString,
  parseJsonWithLimit,
  RequestValidationError,
} from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "source.read");
  if (!auth.ok) return auth.response;

  const repo = getSourceRepository();
  return NextResponse.json(
    {
      data: {
        tenant_id: auth.session.tenant_id,
        sources: await repo.listSources(auth.session.tenant_id),
      },
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}

export async function PATCH(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "source.update");
  if (!auth.ok) return auth.response;

  try {
    const repo = getSourceRepository();
    const body = await parseJsonWithLimit(req, { maxBytes: 8 * 1024 });
    const id = asTrimmedString(body.id, 120).toLowerCase();
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "id is required." }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }
    const updated = await repo.updateSource(auth.session.tenant_id, id, {
      enabled: asOptionalBoolean(body.enabled),
      schedule_minutes: asOptionalNumber(body.schedule_minutes),
    });
    if (!updated) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Source not found." }, request_id: rid },
        { status: 404, headers: { "X-Request-Id": rid } },
      );
    }

    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "source.update",
      entity: "source",
      entity_id: updated.id,
      metadata: {
        enabled: updated.enabled,
        schedule_minutes: updated.schedule_minutes,
      },
    });

    return NextResponse.json(
      { data: { source: updated }, request_id: rid },
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
