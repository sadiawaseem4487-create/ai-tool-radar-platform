import { NextRequest, NextResponse } from "next/server";
import { requestId, requireAuth } from "@/lib/auth/session";
import { getSourceRepository } from "@/lib/admin/source-repo";
import { writeAudit } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "source.update");
  if (!auth.ok) return auth.response;

  const p = await params;
  const id = (p.id || "").trim().toLowerCase();
  if (!id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Source id is required." }, request_id: rid },
      { status: 400, headers: { "X-Request-Id": rid } },
    );
  }

  const repo = getSourceRepository();
  const result = await repo.testSource(auth.session.tenant_id, id);
  if (!result.source) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: result.error || "Source not found." }, request_id: rid },
      { status: 404, headers: { "X-Request-Id": rid } },
    );
  }

  await writeAudit({
    tenant_id: auth.session.tenant_id,
    actor_id: auth.session.user_id,
    action: "source.test",
    entity: "source",
    entity_id: id,
    metadata: {
      ok: result.ok,
      error: result.error,
      test_url: result.source.test_url,
    },
  });

  return NextResponse.json(
    {
      data: {
        ok: result.ok,
        source: result.source,
        error: result.error,
      },
      request_id: rid,
    },
    { status: result.ok ? 200 : 502, headers: { "X-Request-Id": rid } },
  );
}
