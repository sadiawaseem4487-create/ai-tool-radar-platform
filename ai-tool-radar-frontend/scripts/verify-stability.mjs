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

async function login(client, email, password) {
  const { res, body } = await client.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`Login failed for ${email}: ${body?.error?.message || res.status}`);
}

function assertStatus(actual, expected, message) {
  if (actual !== expected) fail(`${message}. Expected ${expected}, got ${actual}`);
}

async function main() {
  console.log(`Verifying API stability at ${BASE_URL}`);

  const anonymous = createCookieClient();
  const admin = createCookieClient();
  const user = createCookieClient();
  const toolKey = "step6-tool-key";

  const ready = await anonymous.request("/api/v1/ready");
  assertStatus(ready.res.status, 200, "Readiness endpoint failed");
  if (!ready.body?.checks?.upstream_configured) fail("Upstream is not configured");
  if (!ready.body?.checks?.postgres_enabled) fail("Postgres is not enabled");
  if (!ready.body?.checks?.postgres_connected) fail("Postgres is not connected");
  console.log("PASS: readiness checks");

  await login(admin, "admin@radar.local", "admin123");
  await login(user, "user@radar.local", "user123");
  console.log("PASS: admin and user logins");

  const adminMembers = await admin.request("/api/v1/admin/members");
  assertStatus(adminMembers.res.status, 200, "Admin members access failed");
  console.log("PASS: admin access to admin members");

  const userMembers = await user.request("/api/v1/admin/members");
  assertStatus(userMembers.res.status, 403, "RBAC check failed for user on admin members");
  console.log("PASS: RBAC denies user access to admin members");

  const createComment = await admin.request(`/api/v1/tools/${encodeURIComponent(toolKey)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "step6 stability comment" }),
  });
  assertStatus(createComment.res.status, 200, "Create comment failed");
  const commentId = createComment.body?.data?.comment?.id;
  if (!commentId) fail("Created comment id missing");
  console.log("PASS: create comment");

  const listComments = await admin.request(`/api/v1/tools/${encodeURIComponent(toolKey)}/comments`);
  assertStatus(listComments.res.status, 200, "List comments failed");
  const comments = listComments.body?.data?.comments || [];
  if (!Array.isArray(comments) || !comments.find((c) => c.id === commentId)) {
    fail("Created comment not found in comments list");
  }
  console.log("PASS: list comments includes new comment");

  const partnerCommented = await admin.request(
    `/api/v1/tools?page=1&pageSize=200&partner_commented=true&q=${encodeURIComponent(toolKey)}`,
  );
  assertStatus(partnerCommented.res.status, 200, "partner_commented tools query failed");
  console.log("PASS: tools partner_commented filter response");

  const deleteByUser = await user.request(
    `/api/v1/tools/${encodeURIComponent(toolKey)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
  if (![403, 404].includes(deleteByUser.res.status)) {
    fail(`Expected user delete to be denied, got ${deleteByUser.res.status}`);
  }
  console.log("PASS: non-owner/user cannot delete another user's comment");

  const deleteByAdmin = await admin.request(
    `/api/v1/tools/${encodeURIComponent(toolKey)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
  assertStatus(deleteByAdmin.res.status, 200, "Admin delete comment failed");
  console.log("PASS: admin delete comment");

  const jobs = await admin.request("/api/v1/admin/jobs?limit=10");
  assertStatus(jobs.res.status, 200, "Admin jobs endpoint failed");
  console.log("PASS: admin jobs endpoint");

  console.log("All Step 6 stability checks passed.");
}

main().catch((err) => {
  console.error(`Step 6 verification failed: ${err.message}`);
  process.exit(1);
});
