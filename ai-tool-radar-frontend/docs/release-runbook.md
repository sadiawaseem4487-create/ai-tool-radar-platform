# Release Runbook

This runbook defines the minimum release and rollback steps for AI Tool Radar.

## Pre-release gate

Before any production release:

1. Ensure CI passes:
   - `npm run security:audit`
   - `npm run lint`
   - `npm run build`
2. With the app running against the target environment, run:
   - `npm run verify:release`
3. Confirm:
   - `GET /api/v1/ready` returns `200`
   - admin login works
   - tools list loads
   - comments create/delete works
   - admin jobs endpoint responds

## Release steps

1. Verify the target environment has the correct env vars:
   - `DATABASE_URL`
   - `RADAR_UPSTREAM_URL` or `NEXT_PUBLIC_RADAR_API_URL`
   - auth/session settings for production
2. Apply pending DB migrations:
   - `npm run db:migrate`
3. Deploy the new application version.
4. Run post-deploy smoke checks:
   - `npm run verify:release`
5. Review:
   - `/api/v1/ready`
   - `/api/v1/admin/metrics`
   - recent `observability.alert` audit events

## Rollback steps

If release health checks fail or incident risk is high:

1. Roll back application deployment to the last known good version.
2. Re-run:
   - `GET /api/v1/ready`
   - `npm run verify:release`
3. If the incident is DB-related:
   - stop further schema changes
   - restore from the latest verified backup if data integrity is affected
   - validate critical admin/tool/comment flows before reopening traffic

## Rollback decision triggers

- sustained 5xx errors after deploy
- failed login or broken session handling
- tools API unavailable
- comments or admin jobs failing
- readiness or metrics endpoint showing DB connectivity regression
