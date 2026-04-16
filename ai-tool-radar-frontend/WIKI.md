# AI Tool Radar - Execution Wiki

This file is the exact step-by-step implementation checklist for this workspace.
Follow in order. Do not skip ahead.

## Source Requirements (re-read)

From "Tools List Customer Needs":

1. Tool list must be extensive and up to date.
2. New tools should be added manually and automatically.
3. Tool status updates must be visible; discontinued tools should be removed.
4. Highlight recent/hottest/best tools in category and changes over time.
5. Tools must be categorized for decision-making:
   - value stream/work phase
   - tool type (foundation, fine-tuned, task-specific, agentic)
   - service model (cloud/on-prem/hybrid)
   - cost and pricing categories
   - integrability (open APIs/plugins/closed/hybrid)
   - compliance and governance
6. Include vendor and product quality dimensions:
   - copyrights and IP safety
   - security and data governance
   - performance
   - validation level
   - target use
   - explainability
   - language/localization
   - maturity/stability
7. Allow manual partner comments on tools.
8. Allow strong filtering (including partner-commented tools and category combinations).

## Current Status Snapshot

Completed in this workspace:

- Postgres connectivity and readiness (`/api/v1/ready`) are working.
- Postgres-first repositories with in-memory fallback are active for:
  - audit logs
  - members/users
  - tenant settings
  - source configs
  - triage status
- Tools read APIs are DB-first with upstream fallback:
  - `GET /api/v1/tools`
  - `GET /api/v1/tools/{id}`
- Admin warm endpoint exists:
  - `POST /api/v1/admin/tools/warm`
- Admin UI includes warm tools cache action.

## Exact Steps (One by One)

### Step 1 - Persist job runs as first-class records
Status: DONE

Implement:

- Add `radar_job_runs` table.
- Write job run rows from:
  - tools warm flow
  - sync/ingest flows when present
- Update `GET /api/v1/admin/jobs` to Postgres-first read, with current audit-derived fallback.
- Keep existing API response shape stable.

Done when:

- `/api/v1/admin/jobs` reads from DB when available.
- Failure/success counters and filters still work.
- `npm run lint` and `npm run build` pass.

### Step 2 - Password hardening
Status: DONE

Implement:

- Hash passwords on invite/update using scrypt format (`scrypt$...`).
- Keep login backward-compatible with existing plaintext test users.
- Avoid breaking current `admin@radar.local` default flow.

Done when:

- Newly invited users are stored hashed.
- Existing users can still log in.
- Lint/build pass.

### Step 3 - Manual tool comments (partner comments)
Status: DONE

Implement:

- Add Postgres table for comments (tenant-scoped, tool-scoped, actor-scoped).
- API endpoints:
  - create comment
  - list comments by tool
  - optional delete/edit by permission
- Show comments in tool detail/admin UI.

Done when:

- Partner comments can be added and viewed.
- Audit event written for comment actions.
- Lint/build pass.

### Step 4 - Advanced category model and filtering expansion
Status: DONE

Implement:

- Extend tool metadata fields to cover requirement categories.
- Add filters to `/api/v1/tools` for added categories.
- Ensure filters can be combined.

Done when:

- Multi-filter combinations work reliably.
- API docs are updated.
- Lint/build pass.

### Step 5 - Lifecycle and freshness controls
Status: DONE

Implement:

- Add lifecycle markers (active/discontinued/recent/hot/best logic).
- Persist and expose via tools API.
- Reflect on UI badges and ordering.

Done when:

- Recent/hot/discontinued states are visible and filterable.
- Lint/build pass.

### Step 6 - Validation and stability pass
Status: DONE

Implement:

- Add integration checks for critical APIs in Postgres mode.
- Verify tenant isolation and RBAC on all new endpoints.
- Update `README.md` and `docs/openapi-v1.yaml`.

Done when:

- Critical flows are tested end-to-end.
- Docs match implementation.

## Rule for Execution

When asked "what next," always return the first TODO step from this file.
