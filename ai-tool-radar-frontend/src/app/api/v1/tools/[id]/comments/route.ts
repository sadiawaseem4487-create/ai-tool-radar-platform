import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/auth/audit";
import { authRequired, getClientIp, requestId, requireAuth } from "@/lib/auth/session";
import { createToolCommentRepo, listToolCommentsRepo } from "@/lib/tools/comments-repo";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const p = await params;
  const toolKey = decodeURIComponent((p.id || "").trim());
  if (!toolKey) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tool id is required." }, request_id: rid },
      { status: 400, headers: { "X-Request-Id": rid } },
    );
  }
  let tenantId = "tenant_default";
  if (authRequired()) {
    const auth = requireAuth(req, rid, "tool.read");
    if (!auth.ok) return auth.response;
    tenantId = auth.session.tenant_id;
  } else {
    const maybe = requireAuth(req, rid, "tool.read");
    if (maybe.ok) tenantId = maybe.session.tenant_id;
  }
  const comments = await listToolCommentsRepo(tenantId, toolKey);
  return NextResponse.json(
    { data: { tool_key: toolKey, comments }, request_id: rid },
    { headers: { "X-Request-Id": rid } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "tool.update_triage");
  if (!auth.ok) return auth.response;
  const rate = checkRateLimit({
    key: `comment:create:${auth.session.tenant_id}:${auth.session.user_id}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "security.rate_limit.denied",
      entity: "tool_comment",
      entity_id: "create",
      metadata: { endpoint: "/api/v1/tools/[id]/comments", retry_after_seconds: rate.retryAfterSeconds },
    });
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many comment requests." }, request_id: rid },
      {
        status: 429,
        headers: {
          "X-Request-Id": rid,
          "Retry-After": String(rate.retryAfterSeconds),
        },
      },
    );
  }
  const p = await params;
  const toolKey = decodeURIComponent((p.id || "").trim());
  if (!toolKey) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tool id is required." }, request_id: rid },
      { status: 400, headers: { "X-Request-Id": rid } },
    );
  }
  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 8 * 1024 });
    const text = asTrimmedString(body.body, 2000);
    if (!text) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Comment body is required." }, request_id: rid },
        { status: 400, headers: { "X-Request-Id": rid } },
      );
    }
    const comment = await createToolCommentRepo({
      tenant_id: auth.session.tenant_id,
      tool_key: toolKey,
      actor_id: auth.session.user_id,
      author_email: auth.session.email,
      body: text,
    });
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "tool.comment.create",
      entity: "tool_comment",
      entity_id: comment.id,
      metadata: { tool_key: toolKey },
    });
    return NextResponse.json(
      { data: { comment }, request_id: rid },
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
