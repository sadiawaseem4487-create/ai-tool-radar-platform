import { NextRequest, NextResponse } from "next/server";
import {
  refreshSession,
  jsonError,
  requestId,
  requireAuth,
  setSessionCookie,
} from "@/lib/auth/session";
import { asTrimmedString, parseJsonWithLimit, RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid, "tenant.read");
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonWithLimit(req, { maxBytes: 4 * 1024 });
    const tenantId = asTrimmedString(body.tenant_id, 120);
    if (!tenantId) {
      return jsonError(400, "VALIDATION_ERROR", "tenant_id is required.", rid);
    }
    if (!auth.session.memberships.includes(tenantId)) {
      return jsonError(403, "FORBIDDEN", "Not a member of the requested tenant.", rid);
    }

    const nextSession = refreshSession({ ...auth.session, tenant_id: tenantId });
    const response = NextResponse.json(
      {
        data: {
          user_id: nextSession.user_id,
          email: nextSession.email,
          role: nextSession.role,
          tenant_id: nextSession.tenant_id,
          memberships: nextSession.memberships,
        },
        request_id: rid,
      },
      { headers: { "X-Request-Id": rid } },
    );
    setSessionCookie(response, nextSession);
    return response;
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return jsonError(err.status, err.code, err.message, rid);
    }
    return jsonError(400, "VALIDATION_ERROR", "Invalid request body.", rid);
  }
}
