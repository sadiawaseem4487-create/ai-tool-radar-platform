import { NextRequest, NextResponse } from "next/server";
import { applyTriageStatusRepo } from "@/lib/radar/triage-repo";
import { authRequired, jsonError, requestId, requireAuth } from "@/lib/auth/session";
import { loadToolByIdDbFirst } from "@/lib/server/tools-repo";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  let tenantId = "tenant_default";
  if (authRequired()) {
    const auth = requireAuth(req, rid, "tool.read");
    if (!auth.ok) return auth.response;
    tenantId = auth.session.tenant_id;
  } else {
    const maybe = requireAuth(req, rid, "tool.read");
    if (maybe.ok) tenantId = maybe.session.tenant_id;
  }

  const p = await params;
  const id = decodeURIComponent((p.id || "").trim());
  if (!id) return jsonError(400, "VALIDATION_ERROR", "Tool id is required.", rid);

  try {
    const row = await loadToolByIdDbFirst(id);
    if (!row) return jsonError(404, "NOT_FOUND", "Tool not found.", rid);
    const data = (await applyTriageStatusRepo(tenantId, [row]))[0];
    return NextResponse.json(
      { data, request_id: rid },
      { headers: { "X-Request-Id": rid } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (message === "UPSTREAM_NOT_CONFIGURED") {
      return jsonError(503, "UPSTREAM_NOT_CONFIGURED", "Set RADAR_UPSTREAM_URL or NEXT_PUBLIC_RADAR_API_URL.", rid);
    }
    if (message.startsWith("UPSTREAM_HTTP_")) {
      return jsonError(502, "UPSTREAM_ERROR", `Upstream returned HTTP ${message.replace("UPSTREAM_HTTP_", "")}.`, rid);
    }
    if (message === "INVALID_UPSTREAM_SHAPE") {
      return jsonError(502, "INVALID_UPSTREAM_SHAPE", "Expected array or object with data array.", rid);
    }
    return jsonError(500, "INTERNAL_ERROR", message, rid);
  }
}
