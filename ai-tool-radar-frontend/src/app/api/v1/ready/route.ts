import { NextResponse } from "next/server";
import { pingPostgres, isPostgresEnabled } from "@/lib/server/db";
import { requestId } from "@/lib/auth/session";
import { logRequestEvent, processMetricsSnapshot } from "@/lib/observability/ops";

export const dynamic = "force-dynamic";

export async function GET() {
  const rid = requestId();
  const upstreamConfigured = Boolean(
    process.env.RADAR_UPSTREAM_URL?.trim() || process.env.NEXT_PUBLIC_RADAR_API_URL?.trim(),
  );
  const db = await pingPostgres();
  const metrics = processMetricsSnapshot({
    postgres_enabled: isPostgresEnabled(),
    postgres_ok: db.ok,
    postgres_latency_ms: db.latency_ms,
  });

  const checks = {
    upstream_configured: upstreamConfigured,
    postgres_enabled: isPostgresEnabled(),
    postgres_connected: db.ok,
    postgres_latency_ms: db.latency_ms,
    postgres_error: db.error,
  };
  const ready = checks.upstream_configured && (!checks.postgres_enabled || checks.postgres_connected);
  logRequestEvent({
    level: ready ? "info" : "warn",
    event: "api.request",
    request_id: rid,
    correlation_id: rid,
    route: "/api/v1/ready",
    method: "GET",
    status: ready ? 200 : 503,
  });

  return NextResponse.json(
    {
      ok: ready,
      checks,
      metrics,
      request_id: rid,
    },
    {
      status: ready ? 200 : 503,
      headers: { "X-Request-Id": rid },
    },
  );
}
