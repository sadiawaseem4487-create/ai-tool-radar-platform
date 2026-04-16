import { NextRequest, NextResponse } from "next/server";
import { listAuditByTenant } from "@/lib/auth/audit";
import { requestId, requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "audit.read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;

  return NextResponse.json(
    {
      data: {
        tenant_id: auth.session.tenant_id,
        events: await listAuditByTenant(auth.session.tenant_id, limit),
      },
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}
