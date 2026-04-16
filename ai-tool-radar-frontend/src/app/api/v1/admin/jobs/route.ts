import { NextRequest, NextResponse } from "next/server";
import { requestId, requireAuth } from "@/lib/auth/session";
import { listAdminJobs } from "@/lib/admin/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "audit.read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
  const statusRaw = (url.searchParams.get("status") || "").trim();
  const status = statusRaw === "success" || statusRaw === "failed" ? statusRaw : undefined;
  const source = (url.searchParams.get("source") || "").trim() || undefined;

  const jobs = await listAdminJobs({
    tenantId: auth.session.tenant_id,
    limit,
    status,
    source,
  });

  return NextResponse.json(
    {
      data: {
        tenant_id: auth.session.tenant_id,
        jobs,
      },
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
}
