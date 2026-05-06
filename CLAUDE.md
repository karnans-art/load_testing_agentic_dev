# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose
Simulate production traffic from real data (WAF logs + HAR files) across multiple products.
Each product (app) is tested independently. Results reveal bottlenecks across the full infrastructure.

## Products
| App | Status | WAF Logs | HAR File |
|-----|--------|----------|----------|
| cds | active | apps/cds/waf-logs/ | apps/cds/har-files/ |

_Add new products by creating `apps/<product-name>/` with the same structure._

## Commands

```bash
# Health gate + smoke (quick validation)
npm run health:cds
npm run smoke:cds

# Limit VU count (picks first N users from users.json)
npm run smoke:cds -- --setup 10
npm run stress:cds -- --setup 50 --cloud

# Full scenario suite
npm run production:cds     # WAF-weighted 109 req/min exact rate
npm run peak:cds           # 3x production rate
npm run stress:cds         # ramp 1x → 5x → 10x → recovery
npm run soak:cds           # 2h endurance, 20 VUs
npm run full-flow:cds      # probabilistic mix (40% dashboard, 30% ECG, 15% filter, 15% multi-case)
npm run diagnosis:cds      # case processing loop with WebSocket
npm run websocket:cds      # Socket.IO stress isolation
npm run simulator:cds      # ECG fixture injection only (no doctor VUs)

# Cloud output (requires K6_CLOUD_TOKEN in .env)
npm run smoke:cds:cloud

# User provisioning (one-time, separate from test runs)
npm run create-users:cds -- --count 100 --domain LoadTest3 --prefix lt3 --batch 10
```

All test commands delegate to `runner/run-test.js`, which spawns k6 with environment vars injected from `.env`.

`--setup N` sets `MAX_VUS=N`; scripts read `const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length`. All current scripts honor it. A script that doesn't read `MAX_VUS` will ignore `--setup`.

`run-test.js` spawns k6 with `{ env: { ...process.env } }`, so every `.env` variable (`TRICOG_ADMIN_COOKIE`, `SIMULATOR_ADMIN_URL`, etc.) reaches k6 scripts automatically. Only `BASE_URL`, `MAX_VUS`, and `INVOKER_ENABLED` are explicitly forwarded via `-e`.

**STRICT: Never run any of these commands** — the user always runs tests manually.

## Environment Variables (.env)

**Test runs (required):**
- `BASE_URL` — CDS portal (e.g. `https://dev-new-ecg.tricogdev.net`)
- `INVOKER_ENABLED` — `true`/`false`; switches routing in `diagnosis:cds`

**Cloud output (optional):**
- `K6_CLOUD_TOKEN` — k6 Cloud API token; needed for any `:cloud` variant

**Simulator (required for `simulator:cds`):**
- `TRICOG_ADMIN_COOKIE` — admin session `tlas` cookie
- `SIMULATOR_ADMIN_URL` — admin panel base URL

**User provisioning (required for `create-users:cds`):**
- `ADMIN_URL` — Atlas admin portal URL
- `ADMIN_DOMAIN` — domain name as shown in admin UI (e.g. `LoadTest3`)
- `CDS_ADMIN_COOKIE` — admin `tlas` cookie (expires — refresh before provisioning)
- `GOOGLE_EMAIL` / `GOOGLE_APP_PASSWORD` — Gmail IMAP account for password-reset token extraction

**Datadog (optional):**
- `DD_API_KEY` / `DD_APP_KEY` — enables dual output with `--out statsd`

## Architecture

```
runner/run-test.js          ← CLI entry point (--app, --script, --setup N, --cloud)
runner/create-users.js      ← One-time user provisioning (admin API + IMAP password reset)
runner/setup/provision-lib.js ← Reusable provisioning: createUser(), findResetTokens(), setPassword()

apps/cds/
  config.js                 ← BASE_URL, auth, k6 thresholds
  users.json                ← Pre-provisioned users (NEVER modify — 1:1 VU mapping)
  discovered/traffic-profile.json ← WAF-analyzed endpoints (144 endpoints, 328K hits over 3 days)
  fixtures/                 ← 34 real ECG CSI files for simulator rotation
  scripts/
    lib/cds-auth.js         ← Per-VU login, token cache, 401 auto-refresh
    lib/cds-workflow.js     ← Doctor workflow: dashboard batch → task → ECG viewer → diagnosis
    lib/cds-metrics.js      ← 18 custom k6 Trend/Counter/Rate metrics
    lib/cds-websocket.js    ← Socket.IO v3: handshake, 25s heartbeat, activity events
    lib/cds-simulator.js    ← Admin API fixture pusher (rotates all 34 CSI files)
    smoke.js / production-load.js / stress-test.js / ... ← k6 test scripts

tests/cds100.js             ← Standalone 100-VU integration test — NOT accessible via npm scripts.
                               Run directly: k6 run tests/cds100.js (from project root).
                               Monolithic (no shared libs); contains inline simulator + doctor scenarios.
                               Requires SIMULATOR_ADMIN_URL + TRICOG_ADMIN_COOKIE.
```

**`production-load.js` is architecturally different** from other doctor-flow scripts: it uses weighted random endpoint selection (weight = WAF hits/min per endpoint) rather than `doctorWorkflow()`. No `group()` blocks, no `teardown()`, no `logoutAllDoctors()` call.

## Critical Invariants

### Session Safety (1:1 VU-to-user)
Each VU is assigned exactly one user by direct index (`users[__VU - 1]`). Never use modulo — it causes two VUs to share credentials, producing 401 cascades. `users.json` is never modified at runtime. If 401s appear, the first suspect is session collision.

### users.json is Sacred
`cleanup` only deletes dynamically created users. **Never** delete hardcoded entries: `Karnan`, `User3`, `pooja.cs`, `lt001`, `lt002`, and any explicitly named preferred doctors. Breaking this breaks the 1:1 VU mapping.

### Invoker-Aware Routing
Doctors are automatically categorized as "preferred" (Invoker-assigned) or "non-preferred" (manual-assigned) by reading the `task/users` response once per VU and caching the result. No manual configuration needed — `INVOKER_ENABLED=true` in `.env` switches the routing mode globally. Preferred doctors use `tasks/latest` (passive wait); non-preferred use `tasks/v2` (manual assign).

### Auth Header Format
CDS uses `token: <value>` header — **not** `Authorization: Bearer`. All requests after login must include this header.

### Socket.IO Raw-Text Protocol
`cds-websocket.js` speaks raw Engine.IO text frames over a plain WebSocket (not the socket.io-client library). The handshake sequence is:
1. Server sends `0{...}` (open packet) — VU confirms with `40` (Socket.IO connect)
2. VU sends `42["registerNotification"]` to subscribe
3. Heartbeat: VU sends `2` every 25s; server replies `3`
4. Activity: VU sends `42["clickEventEmiter", {...}]` on a configurable interval

Deviating from this exact sequence causes the server to drop the connection silently.

### Teardown Must Call `logoutAllDoctors()`
Any script that runs the doctor workflow must call `logoutAllDoctors(USERS, VU_COUNT)` in `teardown()`. This marks each doctor inactive and closes their WebSocket, releasing Invoker stickiness. Omitting it leaves doctors "online" on the server, which skews task routing in subsequent runs. (`smoke.js`, `full-doctor-flow.js`, `continuous-diagnosis.js` all do this; `tests/cds100.js` does not.)

### Diagnose Payload
`POST /api/v2/diagnose/{taskId}` in `cds-workflow.js` sends a full structured payload (measurements, classifications, viewer version). The diagnosis string is hardcoded to `"Normal sinus rhythm. Load test diagnosis."` — this is intentional and must stay consistent so ECG reports are distinguishable from real reads.

## Core Principles

### I. Production-Rate Simulation
Every endpoint is called at its EXACT proportional rate from WAF logs.
Never equal distribution. Never random blasting.

### II. App Isolation
Each app under `apps/` is completely self-contained.
- NO imports from other apps
- Each app has its own config, scripts, discovered data
- Shared infra lives in `runner/` only

### III. Real Params from Real Responses
No hardcoded payloads. No fake data.
- Login first → get real token
- Hit each endpoint → capture real request/response
- Use captured payloads in k6 scripts

### IV. Smart Agent Behavior
Agent WARNS, EXPLAINS, and ASKS — never silently fails.
- HAR missing → warn + proceed with WAF + codebase discovery
- null user_agent → evaluate by hit count + URI pattern (NOT auto-skip)
- Conflicting data → prefer HAR over codebase schema

### V. User Agent Filter
INCLUDE: Mozilla, Chrome, Safari, Firefox, Edge, Mobile Safari, null (evaluate)
SKIP: curl/, python-requests, bot, crawler, spider, scrapy, wget, Go-http-client

For null user_agent:
- High hits (>1000) + POST/PUT/DELETE + business URI → INCLUDE
- Low hits (<50) + /health /ping /metrics /internal → SKIP
- Everything else → INCLUDE with WARNING

### VI. Execution Modes
- Local: `k6 run` — development and smoke testing
- Cloud: `k6 run --out cloud` — dashboards + historical comparison (requires K6_CLOUD_TOKEN)
- Dual: `k6 run --out cloud --out statsd` — cloud dashboards + Datadog infra correlation
- CI/CD: post-deploy smoke → production-load → report to Slack/Teams

### VII. One-Time Discovery
Scan codebase ONCE → save to `apps/<name>/discovered/`
Re-scan only when endpoints change.
`runner/run-test.js` reads discovered JSON directly on subsequent runs.

## Workflow
```
INGEST  → Parse WAF Excel + HAR file
ANALYZE → Calculate hit ratios → RPS per endpoint
DISCOVER→ Hit real API → capture payloads (one-time)
GENERATE→ Write k6 scripts with rate-matched scenarios
EXECUTE → Run k6 local or cloud
REPORT  → Bottleneck analysis + Datadog push (optional)
```

## Monitoring (Local)
```bash
docker compose up -d       # Starts InfluxDB + Grafana on localhost:3000
# Then run any test with:
node runner/run-test.js --app cds --script smoke --out influxdb
```
Grafana is pre-provisioned with a 12-panel dashboard (VUs, req/s, error rate, p50/p90/p95/p99, per-endpoint breakdown, WebSocket metrics, check pass rate).

## CI/CD

Two workflows in `.github/workflows/`:

**`smoke-test.yml`** — manual trigger (`workflow_dispatch`). Runs `smoke:cds` with k6 Cloud upload.

**`post-deploy-cds.yml`** — triggered by `repository_dispatch` from the CDS app after a deploy, or manually. Two jobs:
1. **smoke** — always runs; `--setup 5` to cap VUs
2. **full-flow** — currently commented out; runs only if smoke passes
3. **summary** — always posts test status + deploy SHA to GitHub step summary

Secrets required in the repo: `BASE_URL`, `TEST_EMAIL`, `TEST_PASSWORD`, `K6_CLOUD_TOKEN`, `TRICOG_ADMIN_COOKIE`.

## Adding a New Product
1. `mkdir -p apps/<name>/waf-logs apps/<name>/har-files apps/<name>/discovered apps/<name>/scripts apps/<name>/reports`
2. Copy `apps/cds/config.js` → `apps/<name>/config.js` and update values
3. Drop WAF Excel in `apps/<name>/waf-logs/`
4. Drop HAR file in `apps/<name>/har-files/` (optional)
5. Run: `node runner/run-test.js --app <name>`
