# Production Hardening Checklist

This checklist is for moving from feature-complete to production-ready operations.

## Item 1 (Implemented): HTTP security headers baseline

- Add baseline response headers globally:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (disable high-risk browser features)
  - `Strict-Transport-Security` (enabled only in production)
- Keep CSP out of this first pass because inline/style/runtime behavior needs a controlled rollout.

## Item 2 (Implemented): Stronger session and cookie policy

- Force secure cookie policy in production.
- Add explicit session invalidation strategy and rotation cadence.
- Add optional absolute session timeout configuration.

## Item 3 (Implemented): API abuse protection

- Add generic API rate-limiting middleware for write endpoints.
- Add endpoint-specific limits for comments, triage, and warm operations.
- Add structured deny logging for abuse events.

## Item 4 (Implemented): Input and payload constraints

- Centralize request validation schema for all API routes.
- Enforce strict max payload size and field lengths per endpoint.
- Normalize and sanitize user-generated text content.

## Item 5 (Implemented): Database reliability

- Add indexes for high-traffic filters and foreign key patterns.
- Add migration/versioning strategy for schema evolution.
- Add backup/restore and retention policy documentation.

## Item 6 (Implemented): Observability and incident readiness

- Add structured request logs with correlation IDs.
- Add uptime and DB metrics integration.
- Add alerts for error spikes and failed warm/sync runs.

## Item 7 (Implemented): Security and release gate

- Add dependency vulnerability scan to CI.
- Add pre-release smoke checks (auth, tools list, comments, admin jobs).
- Add release runbook with rollback steps.
