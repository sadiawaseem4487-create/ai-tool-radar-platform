import { NextRequest, NextResponse } from "next/server";
import { pingPostgres, postgresPoolMetrics } from "@/lib/server/db";
import { requestId, requireAuth } from "@/lib/auth/session";
import { correlationIdFrom, logRequestEvent, processMetricsSnapshot } from "@/lib/observability/ops";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const correlationId = correlationIdFrom(req, rid);
  const auth = requireAuth(req, rid, "audit.read");
  if (!auth.ok) return auth.response;

  const db = await pingPostgres();
  const metrics = processMetricsSnapshot({
    postgres_enabled: postgresPoolMetrics().enabled,
    postgres_ok: db.ok,
    postgres_latency_ms: db.latency_ms,
  });
  const pool = postgresPoolMetrics();
  logRequestEvent({
    level: "info",
    event: "api.request",
    request_id: rid,
    correlation_id: correlationId,
    route: "/api/v1/admin/metrics",
    method: "GET",
    status: 200,
    tenant_id: auth.session.tenant_id,
  });

  return NextResponse.json(
    {
      data: {
        ...metrics,
        postgres_pool: pool,
      },
      request_id: rid,
      correlation_id: correlationId,
    },
    { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
  );
}
