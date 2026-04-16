# AI Tool Radar - Phase 2 (Scale Readiness)

Requested scope excludes billing/subscription.

## Item 1 (Implemented): Background job runner + queue

- Added queue table migration: `db/migrations/0002_job_queue.sql`
- Added queue enqueue helper: `src/lib/admin/job-queue.ts`
- Warm endpoint supports queued mode via `POST /api/v1/admin/tools/warm?async=true`
- Added worker loop script: `scripts/worker-jobs.mjs`

## Item 2 (Implemented): External alert delivery

- Added webhook delivery for observability alerts:
  - `src/lib/observability/alert-delivery.ts`
- Warm failure / API spike alerts now attempt outbound delivery when `RADAR_ALERT_WEBHOOK_URL` is set.

## Item 3 (Implemented): Migration runner automation

- Added migration runner script: `scripts/run-migrations.mjs`
- Tracks applied migrations in `radar_schema_migrations`
- Script command: `npm run db:migrate`

## Item 4 (Implemented): CI E2E with seeded Postgres

- Extended `.github/workflows/release-gate.yml` with a Postgres-backed `e2e` job.
- CI flow now runs:
  - migrations (`npm run db:migrate`)
  - seed (`npm run db:seed:e2e`)
  - release smoke checks (`npm run verify:release`)

## Commands

- `npm run db:migrate`
- `npm run db:seed:e2e`
- `npm run worker:jobs`
