import { NextRequest, NextResponse } from "next/server";
import {
  jsonError,
  requestId,
  setSessionCookie,
} from "@/lib/auth/session";
import { authenticateUserRepo } from "@/lib/auth/member-repo";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";
import { correlationIdFrom, logRequestEvent } from "@/lib/observability/ops";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rid = requestId();
  const correlationId = correlationIdFrom(req, rid);
  const route = "/api/v1/auth/login";
  const method = "POST";
  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 8 * 1024 });

    const email = asTrimmedString(body.email, 320).toLowerCase();
    const password = asTrimmedString(body.password, 200);
    if (!email || !password) {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: 400,
      });
      return jsonError(400, "VALIDATION_ERROR", "email and password are required.", rid);
    }

    const session = await authenticateUserRepo(email, password);
    if (!session) {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: 401,
      });
      return jsonError(401, "INVALID_CREDENTIALS", "Invalid login credentials.", rid);
    }

    const tenantId = asTrimmedString(body.tenant_id, 120);
    if (tenantId && session.memberships.includes(tenantId)) {
      session.tenant_id = tenantId;
    }

    const response = NextResponse.json(
      {
        data: {
          user_id: session.user_id,
          email: session.email,
          role: session.role,
          tenant_id: session.tenant_id,
          memberships: session.memberships,
        },
        request_id: rid,
        correlation_id: correlationId,
      },
      { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
    );

    setSessionCookie(response, session);
    logRequestEvent({
      level: "info",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 200,
      tenant_id: session.tenant_id,
    });
    return response;
  } catch (err) {
    if (err instanceof RequestValidationError) {
      logRequestEvent({
        level: "warn",
        event: "api.request",
        request_id: rid,
        correlation_id: correlationId,
        route,
        method,
        status: err.status,
        error: err.message,
      });
      return jsonError(err.status, err.code, err.message, rid);
    }
    logRequestEvent({
      level: "warn",
      event: "api.request",
      request_id: rid,
      correlation_id: correlationId,
      route,
      method,
      status: 400,
      error: err instanceof Error ? err.message : "Invalid request body.",
    });
    return jsonError(400, "VALIDATION_ERROR", "Invalid request body.", rid);
  }
}
