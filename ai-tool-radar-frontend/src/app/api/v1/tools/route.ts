import { NextRequest, NextResponse } from "next/server";
import { applyTriageStatusRepo } from "@/lib/radar/triage-repo";
import { authRequired, jsonError, requestId, requireAuth } from "@/lib/auth/session";
import { toolDateMs, toolScore, type ToolRow } from "@/lib/server/tools-feed";
import { loadToolsDbFirst } from "@/lib/server/tools-repo";
import { listCommentedToolKeysRepo } from "@/lib/tools/comments-repo";
import { correlationIdFrom, logRequestEvent, recordApiOutcome } from "@/lib/observability/ops";

export const dynamic = "force-dynamic";

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function values(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .map((x) => x.toLowerCase());
  }
  if (typeof v === "string") {
    return [v.trim().toLowerCase()].filter(Boolean);
  }
  return [];
}

function csvFilter(v: string): string[] {
  return v
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function matchFacet(row: ToolRow, rowKeys: string[], filterValue: string): boolean {
  if (!filterValue || filterValue === "all") return true;
  const wanted = csvFilter(filterValue);
  if (!wanted.length) return true;
  const actual = new Set<string>();
  for (const key of rowKeys) {
    for (const value of values(row[key])) actual.add(value);
  }
  for (const v of wanted) {
    if (actual.has(v)) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const rid = requestId();
  const correlationId = correlationIdFrom(req, rid);
  const route = "/api/v1/tools";
  const method = "GET";
  const startedMs = Date.now();
  let tenantId = "tenant_default";
  if (authRequired()) {
    const auth = requireAuth(req, rid, "tool.read");
    if (!auth.ok) return auth.response;
    tenantId = auth.session.tenant_id;
  } else {
    const maybe = requireAuth(req, rid, "tool.read");
    if (maybe.ok) tenantId = maybe.session.tenant_id;
  }

  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page") || 1);
  const pageSizeRaw = Number(url.searchParams.get("pageSize") || 20);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.max(1, Math.min(100, Math.trunc(pageSizeRaw))) : 20;

  const source = text(url.searchParams.get("source"));
  const category = text(url.searchParams.get("category"));
  const action = text(url.searchParams.get("recommended_action"));
  const q = text(url.searchParams.get("q"));
  const minScoreRaw = Number(url.searchParams.get("minScore") || 0);
  const minScore = Number.isFinite(minScoreRaw) ? minScoreRaw : 0;
  const dateFromRaw = text(url.searchParams.get("dateFrom"));
  const dateToRaw = text(url.searchParams.get("dateTo"));
  const dateFrom = dateFromRaw ? new Date(dateFromRaw).getTime() : 0;
  const dateTo = dateToRaw ? new Date(dateToRaw).getTime() : 0;
  const sortBy = text(url.searchParams.get("sortBy")) || "score";
  const sortOrder = text(url.searchParams.get("sortOrder")) === "asc" ? "asc" : "desc";
  const lifecycle = text(url.searchParams.get("lifecycle"));
  const recent = text(url.searchParams.get("recent"));
  const hot = text(url.searchParams.get("hot"));
  const discontinued = text(url.searchParams.get("discontinued"));
  const valueStream = text(url.searchParams.get("value_stream"));
  const workPhase = text(url.searchParams.get("work_phase"));
  const toolType = text(url.searchParams.get("tool_type"));
  const serviceModel = text(url.searchParams.get("service_model"));
  const pricingModel = text(url.searchParams.get("pricing_model"));
  const integrability = text(url.searchParams.get("integrability"));
  const compliance = text(url.searchParams.get("compliance"));
  const validationLevel = text(url.searchParams.get("validation_level"));
  const targetUse = text(url.searchParams.get("target_use"));
  const explainability = text(url.searchParams.get("explainability"));
  const language = text(url.searchParams.get("language"));
  const toolMaturity = text(url.searchParams.get("tool_maturity"));
  const vendorMaturity = text(url.searchParams.get("vendor_maturity"));
  const partnerCommented = text(url.searchParams.get("partner_commented"));

  try {
    const feed = await loadToolsDbFirst();
    let rows = feed.rows;

    if (source && source !== "all") rows = rows.filter((r) => text(r.source) === source);
    if (category && category !== "all") rows = rows.filter((r) => text(r.category) === category);
    if (action && action !== "all") rows = rows.filter((r) => text(r.recommended_action) === action);
    if (minScore > 0) rows = rows.filter((r) => toolScore(r) >= minScore);
    if (dateFrom) rows = rows.filter((r) => toolDateMs(r) >= dateFrom);
    if (dateTo) rows = rows.filter((r) => toolDateMs(r) <= dateTo);
    rows = rows.filter((r) => matchFacet(r, ["value_stream", "value_streams"], valueStream));
    rows = rows.filter((r) => matchFacet(r, ["work_phase", "work_phases"], workPhase));
    rows = rows.filter((r) => matchFacet(r, ["tool_type", "tool_types"], toolType));
    rows = rows.filter((r) => matchFacet(r, ["service_model", "service_models"], serviceModel));
    rows = rows.filter((r) => matchFacet(r, ["pricing_model", "pricing_models"], pricingModel));
    rows = rows.filter((r) => matchFacet(r, ["integrability", "integrability_modes"], integrability));
    rows = rows.filter((r) => matchFacet(r, ["compliance", "compliance_tags"], compliance));
    rows = rows.filter((r) => matchFacet(r, ["validation_level", "validation_levels"], validationLevel));
    rows = rows.filter((r) => matchFacet(r, ["target_use", "target_uses"], targetUse));
    rows = rows.filter((r) => matchFacet(r, ["explainability", "explainability_level"], explainability));
    rows = rows.filter((r) => matchFacet(r, ["language", "languages", "language_localization"], language));
    rows = rows.filter((r) => matchFacet(r, ["tool_maturity", "maturity", "maturity_level"], toolMaturity));
    rows = rows.filter((r) => matchFacet(r, ["vendor_maturity", "vendor_stability"], vendorMaturity));
    if (lifecycle && lifecycle !== "all") {
      rows = rows.filter((r) => text(r.lifecycle_status).toLowerCase() === lifecycle.toLowerCase());
    }
    if (recent === "true" || recent === "false") {
      rows = rows.filter((r) => (recent === "true" ? r.is_recent === true : r.is_recent !== true));
    }
    if (hot === "true" || hot === "false") {
      rows = rows.filter((r) => (hot === "true" ? r.is_hot === true : r.is_hot !== true));
    }
    if (discontinued === "true" || discontinued === "false") {
      rows = rows.filter((r) =>
        discontinued === "true" ? r.is_discontinued === true : r.is_discontinued !== true,
      );
    }
    if (partnerCommented === "true" || partnerCommented === "false") {
      const commented = await listCommentedToolKeysRepo(tenantId);
      rows = rows.filter((r) => {
        const key = text(r.id) || text(r.url) || text(r.title);
        const hasComment = key ? commented.has(key) : false;
        return partnerCommented === "true" ? hasComment : !hasComment;
      });
    }
    if (q) {
      rows = rows.filter((r) => {
        const blob = [
          text(r.title),
          text(r.summary),
          text(r.category),
          text(r.source),
          text(r.url),
          text(r.value_stream),
          text(r.work_phase),
          text(r.tool_type),
          text(r.service_model),
          text(r.pricing_model),
          text(r.integrability),
          text(r.compliance),
          text(r.validation_level),
          text(r.target_use),
          text(r.explainability),
          text(r.language),
          text(r.tool_maturity),
          text(r.vendor_maturity),
        ].join(" ");
        return includesCI(blob, q);
      });
    }

    rows = rows.sort((a, b) => {
      const cmp =
        sortBy === "date"
          ? toolDateMs(a) - toolDateMs(b)
          : sortBy === "title"
            ? text(a.title).localeCompare(text(b.title))
            : toolScore(a) - toolScore(b);
      const base = sortOrder === "asc" ? cmp : -cmp;
      const aDown = a.is_discontinued === true ? 1 : 0;
      const bDown = b.is_discontinued === true ? 1 : 0;
      if (aDown !== bDown) return aDown - bDown;
      const aBoost = a.is_hot === true ? 2 : a.is_recent === true ? 1 : 0;
      const bBoost = b.is_hot === true ? 2 : b.is_recent === true ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return base;
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const data = await applyTriageStatusRepo(tenantId, rows.slice(start, start + pageSize) as ToolRow[]);
    const durationMs = Math.max(0, Date.now() - startedMs);
    logRequestEvent({
      level: "info",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 200,
      duration_ms: durationMs,
      tenant_id: tenantId,
      metadata: { total, page, pageSize },
    });

    return NextResponse.json(
      {
        data,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          filters: {
            source: source || undefined,
            category: category || undefined,
            recommended_action: action || undefined,
            q: q || undefined,
            minScore,
            dateFrom: dateFromRaw || undefined,
            dateTo: dateToRaw || undefined,
            value_stream: valueStream || undefined,
            work_phase: workPhase || undefined,
            tool_type: toolType || undefined,
            service_model: serviceModel || undefined,
            pricing_model: pricingModel || undefined,
            integrability: integrability || undefined,
            compliance: compliance || undefined,
            validation_level: validationLevel || undefined,
            target_use: targetUse || undefined,
            explainability: explainability || undefined,
            language: language || undefined,
            tool_maturity: toolMaturity || undefined,
            vendor_maturity: vendorMaturity || undefined,
            partner_commented: partnerCommented || undefined,
            lifecycle: lifecycle || undefined,
            recent: recent || undefined,
            hot: hot || undefined,
            discontinued: discontinued || undefined,
            sortBy,
            sortOrder,
          },
          data_source: feed.source,
        },
        request_id: rid,
        correlation_id: correlationId,
      },
      { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
    );
  } catch (err) {
    const durationMs = Math.max(0, Date.now() - startedMs);
    const message = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (message === "UPSTREAM_NOT_CONFIGURED") {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: 503,
        duration_ms: durationMs,
        tenant_id: tenantId,
        error: message,
      });
      return jsonError(503, "UPSTREAM_NOT_CONFIGURED", "Set RADAR_UPSTREAM_URL or NEXT_PUBLIC_RADAR_API_URL.", rid);
    }
    if (message.startsWith("UPSTREAM_HTTP_")) {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: 502,
        duration_ms: durationMs,
        tenant_id: tenantId,
        error: message,
      });
      return jsonError(502, "UPSTREAM_ERROR", `Upstream returned HTTP ${message.replace("UPSTREAM_HTTP_", "")}.`, rid);
    }
    if (message === "INVALID_UPSTREAM_SHAPE") {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: 502,
        duration_ms: durationMs,
        tenant_id: tenantId,
        error: message,
      });
      return jsonError(502, "INVALID_UPSTREAM_SHAPE", "Expected array or object with data array.", rid);
    }
    recordApiOutcome({
      route,
      method,
      status: 500,
      request_id: rid,
      correlation_id: correlationId,
      tenant_id: tenantId,
      duration_ms: durationMs,
    });
    logRequestEvent({
      level: "error",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 500,
      duration_ms: durationMs,
      tenant_id: tenantId,
      error: message,
    });
    return jsonError(500, "INTERNAL_ERROR", message, rid);
  }
}
