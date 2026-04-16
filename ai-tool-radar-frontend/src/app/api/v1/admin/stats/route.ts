import { NextRequest, NextResponse } from "next/server";
import { computeAdminStats } from "@/lib/admin/stats";
import { requestId, requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "audit.read");
  if (!auth.ok) return auth.response;

  const stats = await computeAdminStats(auth.session.tenant_id);

  return NextResponse.json(
    {
      data: stats,
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}
