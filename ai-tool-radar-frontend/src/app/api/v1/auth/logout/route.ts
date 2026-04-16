import { NextResponse } from "next/server";
import { clearSessionCookie, requestId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const rid = requestId();
  const response = NextResponse.json(
    { data: { ok: true }, request_id: rid },
    { headers: { "X-Request-Id": rid } },
  );
  clearSessionCookie(response);
  return response;
}
