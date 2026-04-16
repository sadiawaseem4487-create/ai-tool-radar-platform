#!/usr/bin/env node

const BASE_URL = process.env.RADAR_VERIFY_BASE_URL || "http://localhost:3000";

function fail(message) {
  throw new Error(message);
}

function createCookieClient() {
  let cookie = "";
  async function request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const first = setCookie.split(";")[0];
      cookie = cookie ? `${cookie}; ${first}` : first;
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { res, body };
  }
  return { request };
}

function assertStatus(actual, expected, message) {
  if (actual !== expected) fail(`${message}. Expected ${expected}, got ${actual}`);
}

async function login(client, email, password) {
  const { res, body } = await client.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`Login failed for ${email}: ${body?.error?.message || res.status}`);
}

async function main() {
  console.log(`Running release smoke checks against ${BASE_URL}`);

  const anonymous = createCookieClient();
  const admin = createCookieClient();
  const toolKey = `release-smoke-${Date.now()}`;

  const ready = await anonymous.request("/api/v1/ready");
  assertStatus(ready.res.status, 200, "Readiness endpoint failed");
  console.log("PASS: readiness endpoint");

  await login(admin, "admin@radar.local", "admin123");
  console.log("PASS: admin login");

  const tools = await admin.request("/api/v1/tools?page=1&pageSize=5");
  assertStatus(tools.res.status, 200, "Tools list failed");
  if (!Array.isArray(tools.body?.data)) fail("Tools list missing data array");
  console.log("PASS: tools list");

  const createComment = await admin.request(`/api/v1/tools/${encodeURIComponent(toolKey)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "release smoke comment" }),
  });
  assertStatus(createComment.res.status, 200, "Comment create failed");
  const commentId = createComment.body?.data?.comment?.id;
  if (!commentId) fail("Smoke comment id missing");
  console.log("PASS: comment create");

  const jobs = await admin.request("/api/v1/admin/jobs?limit=5");
  assertStatus(jobs.res.status, 200, "Admin jobs failed");
  console.log("PASS: admin jobs");

  const deleteComment = await admin.request(
    `/api/v1/tools/${encodeURIComponent(toolKey)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
  assertStatus(deleteComment.res.status, 200, "Comment delete failed");
  console.log("PASS: comment delete");

  console.log("Release smoke checks passed.");
}

main().catch((err) => {
  console.error(`Release smoke failed: ${err.message}`);
  process.exit(1);
});
