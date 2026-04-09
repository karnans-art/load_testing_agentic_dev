# Agentic Load Testing — Progress Tracker

> Living document. Update as tasks complete or new work is discovered.
> Format: `[x]` = done · `[ ]` = pending · `[~]` = in progress · `[!]` = blocked

---

## Phase 1: Platform Scaffold ✅

- [x] Project structure: `apps/<name>/`, `runner/`, `.specify/`, `.vscode/`
- [x] `runner/run.js` — master orchestrator (`--app`, `--step`, `--mode`)
- [x] `runner/ingest/waf-parser.js` — multi-sheet Excel, domain filter, bot filtering
- [x] `runner/ingest/har-parser.js` — HAR merge, graceful fallback when empty
- [x] `runner/generate/k6-generator.js` — constant-arrival-rate scenario generator
- [x] `.env` — base config (BASE_URL, TEST_USERNAME, TEST_PASSWORD, TEST_DOMAIN)
- [x] `.vscode/tasks.json` — VS Code task palette for all k6 scripts
- [x] `package.json` — npm run scripts (smoke:cds, normal:cds, peak:cds, etc.)
- [x] `CLAUDE.md` — constitution: production-rate simulation, app isolation, auth rules

---

## Phase 2: CDS App (ecg.tricog.com) 🔵 In Progress

### Auth & Session
- [x] Login endpoint: `POST /api/v2/login` with domainId, application, appVersion, custom headers
- [x] `updateActive {isActive:1}` — called once per VU after login (required for tasks/latest)
- [x] Per-VU token model — login once per VU, auto-refresh on 401 (not per-iteration)
- [x] `apps/cds/users.json` — user credentials store (add more users here for 1000-user scale)
- [x] Token passed as `token` header (not `Authorization: Bearer`)

### Smoke Test (`apps/cds/scripts/smoke.js`)
- [x] Login + updateActive wired correctly
- [x] `tasks/latest` — with filter payload (stage, taskTypes, doctorName)
- [x] `tasks/count` — POST `{}`
- [x] `tasks/v2` — with full filter + sortBy payload
- [x] `GET /api/v2/user`
- [x] `GET /api/v2/config`
- [x] `GET /api/v2/language`
- [x] `GET /api/v2/report/total/eta`
- [x] `GET /api/v2/report/doctor/active`
- [ ] `POST /api/v2/doctor-stat/` — **BLOCKED: need correct curl from DevTools** ⚠️

### Shared Workflow Lib (`apps/cds/scripts/lib/`)
- [x] `cds-auth.js` — per-VU login, updateActive, profile fetch, auto-refresh on 401
- [x] `cds-workflow.js` — full doctor flow: tasks/latest → task/assign → per-task → standalone (22 API calls)
- [x] All 4 scripts (smoke, normal, peak, stress) import from lib — zero duplication

### Normal Load Test (`apps/cds/scripts/normal-load.js`)
- [x] Workflow-based: constant-arrival-rate at 12 workflows/min (production rate from WAF)
- [x] Uses shared lib — full doctor workflow per iteration

### Peak Load (`apps/cds/scripts/peak-load.js`)
- [x] 3x production rate (36 workflows/min), configurable via PEAK_MULTIPLIER env var
- [x] Uses shared lib

### Stress Test (`apps/cds/scripts/stress-test.js`)
- [x] Ramping: 1x → 2x → 3x → 4x → 5x → recovery (30 min total)
- [x] maxVUs: 200, relaxed thresholds (stress test pushes limits)
- [x] Uses shared lib

### Production Load Test (`apps/cds/scripts/production-load.js`)
- [x] 19 endpoints at exact WAF production rates (109 req/min total)
- [x] Weighted random endpoint selection — single scenario, VUs = user count
- [x] Proactive token refresh at 20s (before ~27s server expiry)
- [x] Session conflict fix — 1 user = 1 VU, no cross-VU invalidation
- [ ] Validate full 10-min run — all 19 endpoints passing <5% failure

### Scale to 1000 Users
- [ ] Add 1000 test user credentials to `apps/cds/users.json`
- [ ] Verify server supports 1000 concurrent sessions
- [ ] Switch to `k6 cloud` for production-scale run

---

## Phase 3: Admin App (admin.tricog.com) ⏳ Pending

> **Blocked until**: user provides WAF logs for admin domain + HAR file + login curl

- [ ] Scaffold `apps/admin/` directory
- [ ] `apps/admin/users.json`
- [ ] Determine admin login flow (different from CDS?)
- [ ] Smoke test
- [ ] Normal / Peak / Stress scripts

---

## Phase 4: Customer App (customer.tricog.com) ⏳ Pending

> **Blocked until**: user provides WAF logs for customer domain + HAR file + login curl

- [ ] Scaffold `apps/customer/` directory
- [ ] `apps/customer/users.json`
- [ ] Smoke test
- [ ] Normal / Peak / Stress scripts

---

## Phase 5: k6 Cloud + Datadog Integration ⏳ Next

### Strategy
Two output channels from every load test run:
- **k6 Cloud** (`--out cloud`) → load test dashboards, historical comparison, team-shareable links
- **Datadog** (`--out statsd`) → correlate load metrics with existing infra monitoring (CPU, memory, APM traces)

### k6 Cloud Setup
- [ ] Sign up at app.k6.io → get API token
- [ ] Add `K6_CLOUD_TOKEN` to `.env`
- [ ] Add `cloud` options block to all scripts (projectID, name, tags)
- [ ] Update npm scripts: `cloud:cds` → `k6 cloud apps/cds/scripts/production-load.js`
- [ ] Validate dashboards: per-endpoint latency, check pass rates, VU timeline

### Datadog Integration
- [ ] Get `DD_AGENT_HOST` address (existing DD agent in UAT — likely localhost or internal IP)
- [ ] Enable StatsD receiver on DD agent (`dogstatsd_port: 8125` in datadog.yaml)
- [ ] Add `--out statsd` to k6 run commands with `K6_STATSD_ADDR=<DD_AGENT_HOST>:8125`
- [ ] Verify k6 metrics appear in Datadog: `k6.http_req_duration`, `k6.http_reqs`, `k6.checks`
- [ ] Build Datadog dashboard: k6 load metrics alongside existing CPU/memory/APM traces
- [ ] Set Datadog monitors: alert if p95 > threshold during load test window

### Dual Output npm Scripts
```
smoke:cds       → k6 run (local only — fast validation)
production:cds  → k6 run --out cloud --out statsd (both channels)
```

---

## Phase 6: CI/CD Post-Deployment Gate ⏳ Future

### Trigger Flow
```
CDS Deploy (CI/CD) → Post-deploy hook → Smoke test → Pass? → Production load test → Report
                                                    → Fail? → Alert team, block promotion
```

### Prerequisites
- [ ] k6 installed on CI runner (or use k6 Cloud API for remote execution)
- [ ] CI runner has network access to UAT/staging environment
- [ ] `K6_CLOUD_TOKEN`, `DD_AGENT_HOST`, test credentials available as CI secrets
- [ ] `users.json` accessible to CI runner (or stored as CI artifact)

### Pipeline Steps (GitHub Actions / GitLab CI / Jenkins)

#### Step 1: Post-Deploy Smoke (fast gate — ~30s)
- Trigger: after CDS deployment completes
- Run: `k6 run apps/cds/scripts/smoke.js` (1 VU, 22 checks)
- Gate: ALL checks pass, 0% failure → proceed to step 2
- Fail action: alert Slack/Teams, mark deployment as degraded

#### Step 2: Post-Deploy Production Load (full validation — ~10min)
- Trigger: only if smoke passes
- Run: `k6 run --out cloud apps/cds/scripts/production-load.js`
- Gate: `http_req_failed < 5%`, `p95 < 3000ms`
- Fail action: alert team with k6 Cloud dashboard link, do NOT auto-rollback (manual decision)

#### Step 3: Report
- k6 Cloud dashboard link posted to Slack/Teams channel
- Datadog dashboard shows infra impact of deployment
- Historical comparison: this deploy vs previous deploy

### CI Configuration Needed
- [ ] CI pipeline config file (GitHub Actions `.yml` / GitLab `.gitlab-ci.yml` / Jenkinsfile)
- [ ] CI secrets: `K6_CLOUD_TOKEN`, `BASE_URL`, `TEST_USERNAME`, `TEST_PASSWORD`, `TEST_DOMAIN`
- [ ] Slack/Teams webhook for notifications
- [ ] Determine trigger mechanism: webhook from deploy pipeline, or scheduled cron
- [ ] Decide: same repo or separate repo for CI config?

### Future Enhancements
- [ ] Scheduled nightly baseline runs (cron → production-load → compare with previous night)
- [ ] Pre-deployment gate: run load test on staging BEFORE promoting to production
- [ ] Auto-rollback integration (optional, requires high confidence in thresholds)
- [ ] Multi-environment support: staging vs production base URLs

---

## Known Issues / Decisions

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | CDS session expires in ~27s | ✅ Fixed | Per-VU login with 401 auto-refresh |
| 2 | HAR file empty | ✅ Known | uat-ecg.tricogdev.net.har only has 2 ipv4.icanhazip.com GETs — no app traffic. Using WAF data. |
| 3 | `doctor-stat` | ✅ Resolved | Backend-to-backend call — excluded from doctor workflow, added to SYSTEM_INTERNAL_URIS |
| 4 | Generator uses `Authorization: Bearer` | ✅ Fixed | Now uses `appConfig.tokenHeader` — CDS emits `'token': data.token` |
| 5 | Generator login body missing domainId | ✅ Fixed | Now uses `appConfig.loginBody` with env-var substitution |
| 6 | System endpoints in WAF inflating coverage gap | ✅ Fixed | 8 backend-to-backend URIs now excluded via `SYSTEM_INTERNAL_URIS` in waf-parser |
| 7 | normal-load rate was 2.3x production | ✅ Fixed | Corrected from 12 to 6 workflows/min (103 hits/min ÷ 19 calls/workflow) |
| 8 | API call count comment wrong (said 22) | ✅ Fixed | Actual: 19 calls per workflow iteration |
| 9 | production-load 50% failure rate | ✅ Fixed | 46 VUs × 1 user = session cascade. Redesigned: 1 scenario, VUs = user count, weighted endpoint selection |
| 10 | check() inside withAuth double-counting | ✅ Fixed | Moved check() outside withAuth — only checks final (retried) result |

---

## Next Actions (Priority Order)

1. **Me** → Validate production-load.js — run full 10-min, confirm all 19 endpoints pass
2. **You** → Provide `K6_CLOUD_TOKEN` (sign up at app.k6.io → Settings → API token)
3. **You** → Provide `DD_AGENT_HOST` (IP/hostname of existing Datadog agent in UAT)
4. **Me** → Wire up dual output: `--out cloud --out statsd` in npm scripts
5. **You** → Provide CI/CD platform details (GitHub Actions / GitLab CI / Jenkins) for post-deploy gate
6. **You** → Provide 1000 test user list when ready for scale testing
7. **You** → Provide admin + customer WAF/HAR when ready to add those apps
