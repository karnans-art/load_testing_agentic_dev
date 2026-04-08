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

### Normal Load Test (`apps/cds/scripts/normal-load.js`)
- [x] Script generated from WAF traffic profile
- [ ] Verify generated payloads match live API (tasks/latest needs filter body, tasks/v2 needs filter body)
- [x] Add `updateActive` to setup() in generated script (via `postLoginStep` in appConfig)
- [x] Fix generator: CDS uses `token` header not `Authorization: Bearer`
- [x] Fix generator: include `domainId` + `application` + `appVersion` in login body

### Peak Load (`apps/cds/scripts/peak-load.js`)
- [ ] Generate from WAF profile at 3x rate
- [ ] Validate thresholds at peak

### Stress Test (`apps/cds/scripts/stress-test.js`)
- [ ] Ramp-up stages: 10 → 50 → 100 → 200 VUs
- [ ] Track breaking point

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

## Phase 5: Observability & Reporting ⏳ Future

- [ ] Datadog integration — `DD_API_KEY` + `DD_APP_KEY` in `.env` (keys not set yet)
- [ ] k6 → Datadog metrics pipeline
- [ ] Baseline performance report from first production-scale run
- [ ] Alert thresholds calibrated from baseline (p95, error rate)
- [ ] VS Code / Web UI for triggering tests without CLI

---

## Phase 6: CI/CD Gate ⏳ Future

- [ ] Pre-deployment gate (SonarQube-style) — block deploys if p95 > threshold
- [ ] GitHub Actions / CI pipeline integration
- [ ] Scheduled nightly baseline runs

---

## Known Issues / Decisions

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | CDS session expires in ~27s | ✅ Fixed | Per-VU login with 401 auto-refresh |
| 2 | HAR file empty | ✅ Known | uat-ecg.tricogdev.net.har only has 2 ipv4.icanhazip.com GETs — no app traffic. Using WAF data. |
| 3 | `doctor-stat` missing payload | ⚠️ Blocked | Needs correct curl — user accidentally gave tasks/v2 curl |
| 4 | Generator uses `Authorization: Bearer` | ✅ Fixed | Now uses `appConfig.tokenHeader` — CDS emits `'token': data.token` |
| 5 | Generator login body missing domainId | ✅ Fixed | Now uses `appConfig.loginBody` with env-var substitution |

---

## Next Actions (Priority Order)

1. **You** → share `POST /api/v2/doctor-stat/` curl from DevTools (Network tab)
2. **Me** → fix generator: token header + login body for CDS
3. **Me** → run full normal-load.js after fix
4. **You** → provide 1000 test user list when ready for scale testing
5. **You** → provide admin + customer WAF/HAR when ready to add those apps
