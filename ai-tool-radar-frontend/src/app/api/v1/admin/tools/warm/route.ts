import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getClientIp, requestId, requireAuth } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { warmToolsFromUpstream } from "@/lib/server/tools-repo";
import { isPostgresEnabled } from "@/lib/server/db";
import { writeAdminJobRun } from "@/lib/admin/jobs";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  correlationIdFrom,
  logRequestEvent,
  recordApiOutcome,
  recordJobOutcome,
} from "@/lib/observability/ops";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rid = requestId();
  const correlationId = correlationIdFrom(req, rid);
  const route = "/api/v1/admin/tools/warm";
  const method = "POST";
  const auth = requireAuth(req, rid, "ingest.write");
  if (!auth.ok) return auth.response;
  const rate = checkRateLimit({
    key: `tools:warm:${auth.session.tenant_id}:${auth.session.user_id}:${getClientIp(req)}`,
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "security.rate_limit.denied",
      entity: "tool_cache",
      entity_id: "warm",
      metadata: { endpoint: "/api/v1/admin/tools/warm", retry_after_seconds: rate.retryAfterSeconds },
    });
    logRequestEvent({
      level: "warn",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 429,
      tenant_id: auth.session.tenant_id,
    });
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many warm requests." }, request_id: rid },
      {
        status: 429,
        headers: {
          "X-Request-Id": rid,
          "X-Correlation-Id": correlationId,
          "Retry-After": String(rate.retryAfterSeconds),
        },
      },
    );
  }
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const jobId = `job_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

  try {
    const result = await warmToolsFromUpstream();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    await writeAdminJobRun({
      id: jobId,
      tenant_id: auth.session.tenant_id,
      source: "tools.warm",
      status: "success",
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      items_in: result.inserted,
      items_upserted: result.inserted,
      triggered_by: auth.session.user_id,
    });
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "tool.warm",
      entity: "tool_cache",
      entity_id: "radar_tools",
      metadata: {
        job_id: jobId,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
        source: "tools.warm",
        inserted: result.inserted,
        postgres_enabled: isPostgresEnabled(),
      },
    });
    logRequestEvent({
      level: "info",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 200,
      duration_ms: durationMs,
      tenant_id: auth.session.tenant_id,
      metadata: { inserted: result.inserted, source: "tools.warm" },
    });
    return NextResponse.json(
      {
        data: {
          ok: true,
          inserted: result.inserted,
          postgres_enabled: isPostgresEnabled(),
        },
        request_id: rid,
        correlation_id: correlationId,
      },
      { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
    );
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    const message = err instanceof Error ? err.message : "Failed to warm tools cache.";
    await writeAdminJobRun({
      id: jobId,
      tenant_id: auth.session.tenant_id,
      source: "tools.warm",
      status: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      items_in: 0,
      items_upserted: 0,
      error_summary: message,
      triggered_by: auth.session.user_id,
    });
    await writeAudit({
      tenant_id: auth.session.tenant_id,
      actor_id: auth.session.user_id,
      action: "tool.warm",
      entity: "tool_cache",
      entity_id: "radar_tools",
      metadata: {
        job_id: jobId,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
        source: "tools.warm",
        ok: false,
        error: message,
        postgres_enabled: isPostgresEnabled(),
      },
    });
    const jobAlert = recordJobOutcome({
      source: "tools.warm",
      status: "failed",
      request_id: rid,
      correlation_id: correlationId,
      tenant_id: auth.session.tenant_id,
      error: message,
    });
    if (jobAlert) {
      await writeAudit({
        tenant_id: auth.session.tenant_id,
        actor_id: auth.session.user_id,
        action: "observability.alert",
        entity: "job_run",
        entity_id: "tools.warm",
        metadata: jobAlert,
      });
    }
    const apiAlert = recordApiOutcome({
      route,
      method,
      status: 500,
      request_id: rid,
      correlation_id: correlationId,
      tenant_id: auth.session.tenant_id,
      duration_ms: durationMs,
    });
    if (apiAlert) {
      await writeAudit({
        tenant_id: auth.session.tenant_id,
        actor_id: auth.session.user_id,
        action: "observability.alert",
        entity: "api",
        entity_id: route,
        metadata: apiAlert,
      });
    }
    logRequestEvent({
      level: "error",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 500,
      duration_ms: durationMs,
      tenant_id: auth.session.tenant_id,
      error: message,
    });
    return NextResponse.json(
      {
        error: {
          code: "WARM_FAILED",
          message,
        },
        request_id: rid,
        correlation_id: correlationId,
      },
      { status: 500, headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
    );
  }
}
