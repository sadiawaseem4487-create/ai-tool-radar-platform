# AI Tool Radar Frontend

This is a Next.js frontend dashboard for your existing n8n workflow webhook.

## 1) Configure environment

Copy `.env.example` to `.env.local` and set your webhook URL:

```bash
cp .env.example .env.local
```

Set:

```env
NEXT_PUBLIC_RADAR_API_URL=https://YOUR-N8N-DOMAIN/webhook/ai-tool-radar
```

## 2) Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 3) Build check

```bash
npm run build
```

## 3.1) Stability verification (Step 6)

With dev server running and Postgres enabled, run:

```bash
npm run verify:stability
```

This verifies critical Postgres-mode API flows and RBAC behavior:
- readiness checks
- admin vs user access to admin endpoints
- partner comments create/list/delete flow
- tools API filter response path (`partner_commented`)
- admin jobs endpoint reachability

## 3.2) Release smoke checks (Item 7)

With the app running and target environment configured, run:

```bash
npm run verify:release
```

This covers the minimum pre-release gate:
- readiness
- admin login
- tools list
- comments create/delete
- admin jobs reachability

## 4) Deploy

Deploy on Vercel and add the same environment variable there:

- `NEXT_PUBLIC_RADAR_API_URL`

## Production hardening

- Baseline hardening checklist is tracked in `PRODUCTION_HARDENING.md`.
- Item 1 is implemented: global HTTP security headers in `next.config.ts`.
- Item 2 is implemented: session/cookie hardening in `src/lib/auth/session.ts`:
  - configurable session TTL (`RADAR_SESSION_TTL_SECONDS`)
  - configurable absolute session TTL (`RADAR_SESSION_ABSOLUTE_TTL_SECONDS`)
  - session rotation window (`RADAR_SESSION_ROTATE_WINDOW_SECONDS`)
  - cookie secure mode override (`RADAR_COOKIE_SECURE` = `auto|true|false`)
- Item 3 is implemented: write-endpoint rate limiting and deny audit logs (`security.rate_limit.denied`) for:
  - `POST /api/v1/tools/{id}/comments`
  - `DELETE /api/v1/tools/{id}/comments/{commentId}`
  - `PATCH /api/v1/tools/{id}/triage`
  - `POST /api/v1/admin/tools/warm`
- Item 4 is implemented: centralized request validation/payload size guards in `src/lib/security/request-validation.ts`, applied to core write endpoints (auth login/switch-tenant, members invite/role update, tenant/source updates, comments create, triage patch).
- Item 5 is implemented: database reliability baseline:
  - high-traffic Postgres indexes added across tools, audit, jobs, comments, triage, source configs, and users
  - migration/versioning baseline added in `db/migrations/0001_reliability_indexes.sql`
  - backup/restore and retention policy documented in `docs/database-operations.md`
- Item 6 is implemented: observability baseline:
  - structured request logs with `request_id` and `correlation_id` in key API routes
  - metrics integrated in `GET /api/v1/ready` and new admin endpoint `GET /api/v1/admin/metrics`
  - in-memory alerting hooks for API 5xx spikes and failed warm/sync style job runs with `observability.alert` audit events
- Item 7 is implemented: security and release gate:
  - CI workflow added at `.github/workflows/release-gate.yml`
  - dependency vulnerability scan available via `npm run security:audit`
  - release smoke checks available via `npm run verify:release`
  - release and rollback runbook documented in `docs/release-runbook.md`

## Phase 2 scale readiness (excluding billing)

- Phase 2 tracker: `PHASE2.md`
- Added job queue and background worker tooling:
  - enqueue warm jobs with `POST /api/v1/admin/tools/warm?async=true`
  - run worker with `npm run worker:jobs`
- Added migration runner: `npm run db:migrate`
- Added CI/e2e seed helper: `npm run db:seed:e2e`
- Added outbound alert webhook support via `RADAR_ALERT_WEBHOOK_URL`

## Admin overview (optional auth)

When `RADAR_REQUIRE_AUTH=true`, admins can open `/admin` for KPIs backed by `GET /api/v1/admin/stats` (audit + triage aggregates).

## Admin jobs (bridge mode)

- `GET /api/v1/admin/jobs` supports `limit`, `status`, and `source` filters.
- `/admin/jobs` shows recent job-run style rows derived from audit events (`ingest.tools.write`, `tool.sync`).
- This is a bridge implementation for the current slim app; swap to Postgres `job_runs` when that branch is active.

## Admin sources test connection (bridge mode)

- `GET/PATCH /api/v1/admin/sources` manages in-memory source settings (enabled + schedule).
- `POST /api/v1/admin/sources/{id}/test` runs a live connectivity probe to the source URL.
- `POST /api/v1/admin/tools/warm` warms the `radar_tools` cache from upstream (Postgres-first path).
- `/admin/sources` provides per-source controls and "Test connection" actions.

## Admin tenant settings (Postgres-first bridge mode)

- `GET/PATCH /api/v1/admin/tenant` reads/updates tenant display settings using Postgres-first repository with in-memory fallback.
- `/admin/tenant` lets admins edit display name, timezone, and status.

## Admin members management (Postgres-first bridge mode)

- `GET /api/v1/admin/members` lists tenant members.
- `POST /api/v1/admin/members` invites member (`email`, `role`, optional `password`).
- `PATCH /api/v1/admin/members/{id}` updates member role (`user`, `admin`, `super_admin`).
- `DELETE /api/v1/admin/members/{id}` removes membership from current tenant.
- `/admin/members` includes invite, role-save, and remove actions.
- `POST /api/v1/auth/login` authenticates against Postgres-first `radar_users` with in-memory fallback.

## Tools API contract (bridge mode)

- `GET /api/v1/tools` supports pagination and filters: `page`, `pageSize`, `source`, `category`, `recommended_action`, `q`, `minScore`, `dateFrom`, `dateTo`, `sortBy`, `sortOrder`.
- Advanced combined filters are also supported: `value_stream`, `work_phase`, `tool_type`, `service_model`, `pricing_model`, `integrability`, `compliance`, `validation_level`, `target_use`, `explainability`, `language`, `tool_maturity`, `vendor_maturity`, `partner_commented`.
- Lifecycle and freshness filters are supported: `lifecycle`, `recent`, `hot`, `discontinued`.
- `GET /api/v1/tools/{id}` fetches a single tool by id/url/title key.
- `GET /api/v1/tools/{id}/comments` lists partner comments for a tool.
- `POST /api/v1/tools/{id}/comments` creates a partner comment.
- `DELETE /api/v1/tools/{id}/comments/{commentId}` deletes a comment (owner/admin/super_admin).
- Both endpoints enrich rows with tenant triage status from in-memory triage store.

## Postgres transition prep

- Added DB helper at `src/lib/server/db.ts` (`isPostgresEnabled`, `pingPostgres`).
- Added readiness endpoint: `GET /api/v1/ready`.
  - Returns `200` when upstream is configured and Postgres is either disabled or reachable.
  - Returns `503` when required checks fail.
- Current app behavior remains bridge/in-memory unless Postgres-backed routes are introduced later.
