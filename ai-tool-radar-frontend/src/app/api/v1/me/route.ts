import { NextRequest, NextResponse } from "next/server";
import { authRequired, refreshSession, requestId, requireAuth, setSessionCookie, shouldRotateSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rid = requestId();
  const auth = requireAuth(req, rid);

  if (!auth.ok) {
    if (!authRequired()) {
      return NextResponse.json(
        {
          data: {
            authenticated: false,
            user: null,
          },
          request_id: rid,
        },
        { headers: { "X-Request-Id": rid } },
      );
    }
    return auth.response;
  }

  const response = NextResponse.json(
    {
      data: {
        authenticated: true,
        user: {
          user_id: auth.session.user_id,
          email: auth.session.email,
          role: auth.session.role,
          tenant_id: auth.session.tenant_id,
          memberships: auth.session.memberships,
        },
      },
      request_id: rid,
    },
    { headers: { "X-Request-Id": rid } },
  );
  if (shouldRotateSession(auth.session)) {
    setSessionCookie(response, refreshSession(auth.session));
  }
  return response;
}
