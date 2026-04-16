import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/auth/audit";
import { getClientIp, requestId, requireAuth } from "@/lib/auth/session";
import { deleteToolCommentRepo } from "@/lib/tools/comments-repo";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "tool.update_triage");
  if (!auth.ok) return auth.response;
  const rate = checkRateLimit({
    key: `comment:delete:${auth.session.tenant_id}:${auth.session.user_id}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "security.rate_limit.denied",
      entity: "tool_comment",
      entity_id: "delete",
      metadata: {
        endpoint: "/api/v1/tools/[id]/comments/[commentId]",
        retry_after_seconds: rate.retryAfterSeconds,
      },
    });
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many delete requests." }, request_id: rid },
      { status: 429, headers: { "X-Request-Id": rid, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const p = await params;
  const toolKey = decodeURIComponent((p.id || "").trim());
  const commentId = decodeURIComponent((p.commentId || "").trim());
  if (!toolKey || !commentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tool id and comment id are required." }, request_id: rid },
      { status: 400, headers: { "X-Request-Id": rid } },
    );
  }
  const removed = await deleteToolCommentRepo({
    tenant_id: auth.session.tenant_id,
    tool_key: toolKey,
    comment_id: commentId,
    actor_id: auth.session.user_id,
    allow_any: auth.session.role === "admin" || auth.session.role === "super_admin",
  });
  if (!removed.ok) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: removed.reason || "Comment not found." }, request_id: rid },
      { status: 404, headers: { "X-Request-Id": rid } },
    );
  }
  await writeAudit({
    tenant_id: auth.session.tenant_id,
    actor_id: auth.session.user_id,
    action: "tool.comment.delete",
    entity: "tool_comment",
    entity_id: commentId,
    metadata: { tool_key: toolKey },
  });
  return NextResponse.json(
    { data: { ok: true, id: commentId }, request_id: rid },
    { headers: { "X-Request-Id": rid } },
  );
}
