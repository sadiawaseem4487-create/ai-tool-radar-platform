import { NextRequest } from "next/server";

type ApiOutcomeInput = {
  route: string;
  method: string;
  status: number;
  request_id: string;
  correlation_id: string;
  tenant_id?: string;
  duration_ms?: number;
};

type JobOutcomeInput = {
  source: string;
  status: "success" | "failed";
  request_id: string;
  correlation_id: string;
  tenant_id?: string;
  error?: string;
};

type AlertEvent = {
  code: "API_ERROR_SPIKE" | "JOB_RUN_FAILED";
  severity: "warning" | "critical";
  message: string;
  metadata: Record<string, unknown>;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarObsErrorsByRoute?: Map<string, number[]>;
  __radarObsAlertCooldown?: Map<string, number>;
};

function errorsByRoute(): Map<string, number[]> {
  if (!rootGlobal.__radarObsErrorsByRoute) {
    rootGlobal.__radarObsErrorsByRoute = new Map<string, number[]>();
  }
  return rootGlobal.__radarObsErrorsByRoute;
}

function alertCooldownMap(): Map<string, number> {
  if (!rootGlobal.__radarObsAlertCooldown) {
    rootGlobal.__radarObsAlertCooldown = new Map<string, number>();
  }
  return rootGlobal.__radarObsAlertCooldown;
}

export function correlationIdFrom(req: NextRequest, fallbackRequestId: string): string {
  const incoming = req.headers.get("x-correlation-id")?.trim();
  return incoming || fallbackRequestId;
}

export function logRequestEvent(input: {
  level: "info" | "warn" | "error";
  event: string;
  request_id: string;
  correlation_id: string;
  route: string;
  method: string;
  status?: number;
  tenant_id?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}): void {
  const payload = {
    ts: new Date().toISOString(),
    level: input.level,
    event: input.event,
    request_id: input.request_id,
    correlation_id: input.correlation_id,
    route: input.route,
    method: input.method,
    status: input.status,
    tenant_id: input.tenant_id,
    duration_ms: input.duration_ms,
    error: input.error,
    ...(input.metadata || {}),
  };
  const line = JSON.stringify(payload);
  if (input.level === "error") {
    console.error(line);
  } else if (input.level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function recordApiOutcome(input: ApiOutcomeInput): AlertEvent | null {
  if (input.status < 500) return null;
  const now = Date.now();
  const routeKey = `${input.method.toUpperCase()} ${input.route}`;
  const byRoute = errorsByRoute();
  const existing = byRoute.get(routeKey) || [];
  const windowStart = now - 5 * 60 * 1000;
  const pruned = existing.filter((ts) => ts >= windowStart);
  pruned.push(now);
  byRoute.set(routeKey, pruned);
  if (pruned.length < 8) return null;

  const alertKey = `api-spike:${routeKey}`;
  const cooldown = alertCooldownMap();
  const last = cooldown.get(alertKey) || 0;
  if (now - last < 10 * 60 * 1000) return null;
  cooldown.set(alertKey, now);
  return {
    code: "API_ERROR_SPIKE",
    severity: "critical",
    message: `5xx spike detected on ${routeKey} (${pruned.length} errors in 5m).`,
    metadata: {
      route: input.route,
      method: input.method,
      error_count_5m: pruned.length,
      request_id: input.request_id,
      correlation_id: input.correlation_id,
      tenant_id: input.tenant_id,
    },
  };
}

export function recordJobOutcome(input: JobOutcomeInput): AlertEvent | null {
  if (input.status !== "failed") return null;
  const now = Date.now();
  const alertKey = `job-failed:${input.source}`;
  const cooldown = alertCooldownMap();
  const last = cooldown.get(alertKey) || 0;
  if (now - last < 5 * 60 * 1000) return null;
  cooldown.set(alertKey, now);
  return {
    code: "JOB_RUN_FAILED",
    severity: "warning",
    message: `Job run failed for source ${input.source}.`,
    metadata: {
      source: input.source,
      request_id: input.request_id,
      correlation_id: input.correlation_id,
      tenant_id: input.tenant_id,
      error: input.error,
    },
  };
}

export function processMetricsSnapshot(input: {
  postgres_enabled: boolean;
  postgres_ok: boolean;
  postgres_latency_ms?: number;
}): {
  uptime_seconds: number;
  process: { rss_bytes: number; heap_used_bytes: number; heap_total_bytes: number; node_version: string };
  postgres: { enabled: boolean; connected: boolean; latency_ms?: number };
} {
  const mem = process.memoryUsage();
  return {
    uptime_seconds: Math.max(0, Math.floor(process.uptime())),
    process: {
      rss_bytes: mem.rss,
      heap_used_bytes: mem.heapUsed,
      heap_total_bytes: mem.heapTotal,
      node_version: process.version,
    },
    postgres: {
      enabled: input.postgres_enabled,
      connected: input.postgres_ok,
      latency_ms: input.postgres_latency_ms,
    },
  };
}
