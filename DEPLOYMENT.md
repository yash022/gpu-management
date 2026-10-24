# Session rollout and deployment

## Required configuration

Use Node 22+ and PostgreSQL 16+. Terminate HTTPS at a trusted reverse proxy and
serve the SPA and `/api` from the same origin. Set:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://APPLICATION_USER:SECRET@DATABASE_HOST/gpuspace
FRONTEND_ORIGIN=https://gpu.your-university.example
DB_POOL_MAX=10
PORT=5000
```

The example database credential is a placeholder. Supply real credentials through
your deployment's secret manager. Configure database TLS as required by your host.
`FRONTEND_ORIGIN` accepts comma-separated explicit HTTPS origins. No wildcard
origins are accepted for production. Set `TRUST_PROXY` only to the actual proxy
IP addresses/subnets, never blanket `true`: client-IP rate limiting depends on it.

Build frontend with `npm ci && npm run build`. Deploy `frontend/dist` with SPA
fallback, a short/no-cache policy for index.html, and immutable caching for hashed
assets. Proxy `/api` without caching and preserve cookies and CSRF headers. Apply
a frontend CSP at the proxy; the API's Helmet headers do not protect static HTML
served by a separate server. HTTPS, HSTS, and proxy-header handling must be checked
in the actual deployment.

## Vercel page reloads

Deploy the full application with the repository root as the Vercel Root Directory.
The root `vercel.json` routes `/api` requests to the backend and all other requests
to the frontend service. Its `services.frontend.rewrites` serves `index.html` for
client-side routes such as `/login`, `/register`, and `/dashboard`, so opening or
refreshing these URLs loads React instead of returning a hosting 404. Existing
static files are served normally.

Keep the SPA rewrite in the root service configuration; `frontend/vercel.json`
also supplies it for standalone frontend deployments. After deploying, open and
refresh `/login` and `/register`, check that JavaScript/CSS assets load, and confirm
`/api/health` still returns the backend response.

## Database migration

### Neon connection timeouts on Vercel

If runtime logs report a PostgreSQL connection timeout, verify the Production
`DATABASE_URL` against the connection string in the Neon project's Connect dialog.
Use the intended production branch/database and its pooled connection string,
preserving the TLS parameters supplied by Neon. Check that the Neon endpoint is
available and its network restrictions permit the deployment. Redeploy after
updating Vercel environment variables; changing them does not update existing
deployments.

Production and Vercel deployments never fall back to an in-memory database.
That fallback would store login sessions separately in each function instance,
causing successful logins followed by `SESSION_EXPIRED`. A failed database
initialization now returns HTTP 503 for login instead. Local development retains
the demo fallback. `ALLOW_IN_MEMORY_DB` cannot override production persistence.
Connection attempts allow up to 10 seconds. After a failed initialization, a later
request can retry after a one-second cooldown; concurrent requests share that
attempt. Temporary startup failures do not require a redeployment to recover.

Once the connection works, run the migration below against the same Neon database
before verifying login, `/api/ready`, and authenticated requests after reload.

Back up the database, then run `cd backend && npm ci && npm run migrate` with
`DATABASE_URL` set. Migration adds session/rate-limit tables and indexes without
changing existing users, reservations, or GPU records. The migration takes an
advisory lock and transaction. Production startup checks schema readiness and
does not apply DDL or seed demo accounts. Development retains automatic setup.

Run old and new authentication versions as a coordinated rollout: old JWT clients
are incompatible with cookie-session APIs. Deploy the backend and frontend
together, invalidate cached HTML, and require everyone to sign in again. JWT_SECRET
is no longer used. Never import the local seed.sql into production.

Provision the first administrator through your controlled operational process;
the public registration route never creates admins. The application does not
provide MFA, institutional SSO, email verification, or password-recovery delivery.
Decide those requirements before a public institutional launch.

## Scaling and operations

Session revocation and authentication rate limits are stored in PostgreSQL and
shared across backend replicas. No sticky session routing is required for auth.
Each process uses at most `DB_POOL_MAX` connections: replicas times pool size must
fit within the database connection budget with headroom for migrations/operations.
Database statements have a 10-second timeout. Expired session/rate-limit records
are pruned at startup and every 15 minutes; cleanup failures are logged.

`/api/health` is liveness; `/api/ready` performs a database query and returns 503
when unavailable. SIGTERM/SIGINT stop accepting requests, drain connections, and
close the database pool, with a 15-second shutdown deadline. Monitor 5xx responses,
latency, failed logins, rate-limit events, pool usage, and cleanup failures.

The waitlist currently uses process-local serialization for position assignment.
Coordinate that operation in PostgreSQL before enabling multiple queue-writing
replicas. Authentication scaling does not by itself certify the entire application
for arbitrary traffic. Benchmark representative traffic and exercise database
failover, backup restoration, and load-balancer behavior before launch.

See TESTING.md for the exact local checks and what remains unverified.
