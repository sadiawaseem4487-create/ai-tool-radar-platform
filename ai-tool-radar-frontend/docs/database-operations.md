# Database Operations Guide

This document defines migration, backup, restore, and retention practices for AI Tool Radar.

## Migration and versioning strategy

- Store SQL migrations in `db/migrations/` using ordered filenames:
  - `0001_reliability_indexes.sql`
  - `0002_<change-name>.sql`
- Migrations must be:
  - idempotent where practical (`IF NOT EXISTS`)
  - backward compatible for at least one deploy window
  - reviewed together with application code changes
- Runtime schema guards (`ensure*Schema`) remain enabled as a safety net for local/dev and bridge environments.
- For production deploys, run migrations before enabling new app code paths.

### Apply a migration manually

```bash
psql "$DATABASE_URL" -f db/migrations/0001_reliability_indexes.sql
```

## Backup policy

- Full logical backup: daily
- Incremental/WAL archival: every 15 minutes (or managed equivalent)
- Keep encrypted backups in a separate storage account/bucket
- Validate backup job success with alerting on failures

### Example logical backup command

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backups/radar_$(date +%Y%m%d_%H%M%S).dump"
```

## Restore policy

- Target recovery objectives:
  - RPO: <= 15 minutes
  - RTO: <= 60 minutes
- Run restore drills at least monthly.
- After restore, verify:
  - app readiness endpoint (`/api/v1/ready`)
  - authenticated tools list and comment flows
  - admin jobs/members endpoints

### Example restore command

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "backups/<file>.dump"
```

## Retention policy

- Daily backups: retain 35 days
- Weekly backups: retain 12 weeks
- Monthly backups: retain 12 months
- Any backup used for incident investigations: retain until incident close + 90 days

## Indexes introduced in baseline reliability pass

- `radar_tools`: source/category/action/score/published/lifecycle/updated
- `radar_audit_logs`: tenant+created/action+created/actor+created
- `radar_job_runs`: tenant+started/tenant+status+started/tenant+source+started
- `radar_tool_comments`: tenant+tool+created and tenant+actor+created
- `radar_triage_status`: tenant+updated
- `radar_source_configs`: tenant+name and tenant+enabled
- `radar_users`: role and tenant
