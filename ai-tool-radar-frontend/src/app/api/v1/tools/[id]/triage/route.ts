import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/auth/audit";
import { authRequired, getClientIp, requestId, requireAuth } from "@/lib/auth/session";
import { setTriageStatusRepo } from "@/lib/radar/triage-repo";
import { type TriageStatus } from "@/lib/radar/triage-store";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

const ALLOWED: TriageStatus[] = ["new", "testing", "watch", "adopted", "ignored"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const p = await params;

  let tenantId = "tenant_default";
  let actorId = "system";

  if (authRequired()) {
    const auth = requireAuth(req, rid, "tool.update_triage");
    if (!auth.ok) return auth.response;
    tenantId = auth.session.tenant_id;
    actorId = auth.session.user_id;
  }

  const rate = checkRateLimit({
    key: `triage:update:${tenantId}:${actorId}:${getClientIp(req)}`,
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    await writeAudit({
      tenant_id: tenantId,
      actor_id: actorId,
      action: "security.rate_limit.denied",
      entity: "tool_triage",
      entity_id: "update",
      metadata: { endpoint: "/api/v1/tools/[id]/triage", retry_after_seconds: rate.retryAfterSeconds },
    });
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many triage updates." }, request_id: rid },
      { status: 429, headers: { "X-Request-Id": rid, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 4 * 1024 });
    const status = asTrimmedString(body.status, 40) as TriageStatus;
    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "status is invalid" }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }

    const key = asTrimmedString(body.key, 400) || asTrimmedString(p.id, 400);
    if (!key) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "id/key is required" }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }

    await setTriageStatusRepo(tenantId, key, status);

    await writeAudit({
      tenant_id: tenantId,
      actor_id: actorId,
      action: "tool.triage.update",
      entity: "tool",
      entity_id: key,
      metadata: { status },
    });

    return NextResponse.json(
      { data: { id: p.id, key, status }, request_id: rid },
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
