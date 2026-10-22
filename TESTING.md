# Validation and remaining limits

## Coverage

Backend suites cover registration/login validation, privilege restrictions, current
roles, deleted users, GPU validation, invalid/past/unavailable bookings, concurrent
overlap prevention, adjacent slots, ownership, queue notifications, cancellations,
notification privacy, request limits, and authentication throttling.

Session tests cover cookie flags, hash-only persistence, CSRF, rotation, logout
replay, idempotent logout, all-device revocation, absolute/idle expiry, forged
cookies, legacy JWT rejection, database outages, shared atomic rate counters, and
100 authenticated reads at concurrency 10. Separate production-mode Node processes
verify secure cookie attributes, session continuity after a process restart, and
revocation across instances using PostgreSQL.

Playwright checks desktop and mobile Chromium user journeys: registration, login,
password visibility, remembered sessions, page reload, return to the requested
page, multiple tabs, browser back navigation, duplicate submission, pending state,
offline logout and retry, session-verification outage recovery, expiry messages,
rate-limit feedback, all-device logout, GPU search/filtering, bookings,
notifications, cancellation, administrator inventory/analytics, and catalog retry.
Login and catalog screens receive automated axe WCAG 2 A/AA scans.

## Running the checks

- `cd backend && npm test`: API/session suites using pg-mem; cross-process test is
  skipped unless `SESSION_TEST_DATABASE_URL` is set.
- Set `SESSION_TEST_DATABASE_URL` to a **disposable PostgreSQL database**, then run
  `npm run test:postgres` in backend. These tests create/delete test accounts and
  apply the schema. They must not target production.
- Set `API_TEST_DATABASE_URL` to a separate, fresh disposable PostgreSQL database
  and run `node --test tests/api.test.js` to exercise booking transactions on
  PostgreSQL. It creates test users/resources and deliberately exhausts rate limits.
- `cd frontend && npm test`: isolated servers on 5001/5174 and Chromium desktop/
  mobile projects. Install browsers using `npx playwright install chromium` first.
- `npm run build`, `npm run lint`, and `npm audit` in frontend; `npm audit` in backend.
- `.github/workflows/ci.yml` defines repeatable checks with a PostgreSQL 16 service.
  The workflow has been added locally; a hosted CI run is not claimed.

## Evidence and limits

The API and session suites have been run locally against both pg-mem and a
PostgreSQL 16 container. Cross-process session revocation and restart continuity
have also been verified. Browser testing uses desktop and mobile Chromium; it is
not equivalent to Safari, Firefox, real-device, or screen-reader testing.

The concurrent read run is a smoke test, not a sustained load/soak/capacity test.
This work is not an exhaustive penetration test or accessibility certification.
Production HTTPS termination, live infrastructure, failover, backup restoration,
and real traffic volume still need deployment-specific verification.

Authentication uses shared PostgreSQL state and bounded connection pools. Waitlist
position allocation still needs database-level coordination before running queue
writers across replicas. Booking transactions lock the GPU row; external SQL
writers must follow that locking protocol. pg-mem cannot validate full PostgreSQL
transaction semantics. Existing React lint warnings about fetching in effects are
non-blocking and documented rather than reported as clean.

Self-service password reset, verified institutional email, MFA/SSO, and account
recovery delivery are not implemented. Login directs users to the campus GPU
administrator for access support; no nonfunctional reset link is displayed.
Faculty/researcher roles remain self-selected without administrative privileges.

Analytics count reservations, not measured GPU usage. The waitlist sends a
notification when a slot is cancelled; it does not allocate date-specific slots.
The pre-existing local changes to `backend/db/seed.sql` were preserved.
