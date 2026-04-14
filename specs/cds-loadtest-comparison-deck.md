# CDS Load Testing Platform — Comparison Report

**Project A:** agentic-loadtesting (Karnan)
**Project B:** loadtest-cds100 (Suresh)
**Date:** April 2026

---

## 1. Overview

Both projects load-test the same CDS (Clinical Decision Support) application — the ECG doctor workflow where doctors login, view cases, assign, diagnose, and submit reports. Both use **k6** as the load testing engine and target the same API endpoints.

---

## 2. Side-by-Side Comparison

| Area | Project A (Karnan) | Project B (Suresh) |
|------|-------------------|-------------------|
| **Engine** | k6 | k6 |
| **Target** | UAT (`uat-ecg.tricogdev.net`) | Dev (`dev-split-ecg.tricogdev.net`) |
| **Endpoints tested** | 23 | 26 |
| **Test scenarios** | 4 | 6 |
| **Shared libraries** | Yes (`cds-auth.js`, `cds-workflow.js`) | Yes (`auth.js`, `config.js`, `metrics.js`, `utils.js`, `websocket.js`) |
| **CI/CD** | GitHub Actions | GitHub Actions |

---

## 3. Test Coverage

### 3.1 Scenarios

| Scenario | Project A | Project B |
|----------|-----------|-----------|
| Smoke (quick validation) | Yes | Yes |
| Production / Average load | Yes (WAF-weighted) | Yes (ramp 0-20 VUs) |
| Peak load (3x) | Yes | Yes (spike: 0-200 VUs in 30s) |
| Stress (ramping to breaking point) | Yes (1x-5x ramp) | Yes (0-150 VUs staged) |
| Soak (long duration, memory leaks) | No | Yes (20 VUs, 2 hours) |
| Continuous diagnosis loop | No | Yes (open-diagnose-next repeat) |

### 3.2 API Endpoints

| Endpoint | Project A | Project B |
|----------|-----------|-----------|
| Login + updateActive | Yes | Yes |
| tasks/latest, tasks/v2, tasks/count | Yes | Yes |
| user, config, language, config/version/viewer | Yes | Yes |
| report/total/eta, report/doctor/active | Yes | Yes |
| report/doctor/avg, report/day/avg | Yes (empty body) | Yes (shift payload) |
| getQueueLength | Yes | Yes |
| **task/users?role=undefined** | **Yes** | No |
| **task/assign** | **Yes (correct username)** | Yes (hardcoded, can fail) |
| nextEcg | Yes | Yes |
| tasks/{id}/algo | Yes | Yes |
| ecgData/{id} | Yes | Yes |
| patient/{id} | Yes | Yes |
| tasks/{id}/history/count | Yes | Yes |
| case/{id}/comments/history | Yes | Yes |
| **POST /api/case/simulator** | **Yes** | No |
| POST /diagnose | No | **Yes** |
| WebSocket (Socket.IO) | No | **Yes** |
| getSearchList | No | **Yes** |
| ecg/reports/{id} | No | **Yes** |
| viewer2B/configs | No | **Yes** |

---

## 4. Key Differentiators

### 4.1 Project A Strengths

| Feature | What it does | Why it matters |
|---------|-------------|----------------|
| **Simulator push** | Injects ECG cases via admin API during tests | Ensures doctors always have fresh cases to process — tests aren't dependent on pre-existing data |
| **Dynamic user provisioning** | `--setup N` creates N users, runs test, auto-deactivates after | One command to go from zero to N-user load test. No manual user management |
| **Auto user cleanup** | Deactivates test users after test via admin API | UAT stays clean. No leftover test accounts |
| **Correct task/assign** | Calls `task/users` API first to get valid username | Prevents "Domain missing username" 400 errors. Their hardcoded approach can fail |
| **WAF-weighted production test** | Each endpoint called at exact production rate from WAF logs | Realistic traffic simulation — not equal distribution or guesswork |
| **Session collision fix** | 1:1 VU-to-user mapping without modulo | Zero risk of two VUs invalidating each other's sessions |
| **Single IMAP batch** | One Gmail connection for all password resets | Scales to 50+ users without hitting Gmail rate limits |

### 4.2 Project B Strengths

| Feature | What it does | Why it matters |
|---------|-------------|----------------|
| **WebSocket testing** | Full Socket.IO load test — connect, heartbeat, activity events | Tests real-time notification infrastructure under load. Doctors rely on live updates |
| **Diagnosis submission** | Complete workflow: open case, review 30-60s, submit diagnosis | Tests the most critical business action. We stop at viewing the case |
| **Custom k6 metrics** | Named metrics: loginDuration, dashboardLoadDuration, caseOpenDuration, etc. | Pinpoints exactly which phase is slow. Default k6 metrics only show aggregate |
| **Grafana + InfluxDB** | Real-time dashboards with VU timeline, error rate, p95 per endpoint | Visual monitoring during test runs. We only see results after the test ends |
| **Browser tests** | Chromium-based login flow and full user journey | Tests real rendering, JavaScript execution, Web Vitals (LCP, CLS) |
| **Soak test** | 20 VUs for 2 hours | Catches memory leaks and performance degradation over time |
| **Probabilistic VU routing** | 40% dashboard, 30% ECG, 15% filter, 15% multi-case | Simulates realistic user behavior mix, not uniform traffic |
| **http.batch()** | Dashboard APIs called in parallel | Matches real browser behavior where multiple XHR fire simultaneously |

---

## 5. Architecture Comparison

### 5.1 Project Structure

```
Project A                              Project B
=========                              =========
apps/cds/scripts/                      scripts/api/          (5 test scripts)
  smoke.js                             scripts/browser/      (2 browser tests)
  peak-load.js                         scripts/admin/        (user creation)
  stress-test.js                       scripts/discover/     (6 Playwright scripts)
  production-load.js                   scenarios/            (6 scenario wrappers)
  lib/cds-auth.js                      lib/auth.js
  lib/cds-workflow.js                  lib/config.js
runner/run-test.js                     lib/metrics.js
runner/setup/provision-lib.js          lib/utils.js
tests/cds100.js                        lib/websocket.js
.github/workflows/smoke-test.yml       .github/workflows/ci.yml
                                       docker-compose.yml    (Grafana + InfluxDB)
                                       Makefile              (30+ targets)
                                       docs/                 (Astro site, 40+ pages)
```

### 5.2 User Provisioning

```
Project A (automated)                  Project B (manual)
=====================                  ====================
--setup N flag                         make setup-users ATLAS_SESSION="..."
  |                                      |
  v                                      v
POST /api/hubdoctor (create)           POST /api/hubdoctor (create)
  |                                      |
  v                                      v
IMAP: batch fetch reset emails         Assume password works (no verification)
  |                                      |
  v                                      v
POST /api/v2/password/update           Save to test-users.json
  |                                      |
  v                                      |
Run k6 test                            Done (manual k6 run separately)
  |
  v
PUT /api/hub/toggle-status (cleanup)
  |
  v
Restore users.json
```

### 5.3 Authentication Strategy

| | Project A | Project B |
|---|---|---|
| **Single-user tests** | Each VU gets unique user (1:1) | All VUs share one token from setup() |
| **Multi-user tests** | Same (always 1:1) | Per-VU user from test-users.json |
| **VU-to-user mapping** | `USERS[__VU - 1]` (no modulo) | `USERS[(__VU - 1) % length]` (collision risk) |
| **Token refresh** | On 401, re-login | On 401, re-login |

---

## 6. Known Issues

| Issue | Project A | Project B |
|-------|-----------|-----------|
| Session collision (modulo bug) | **Fixed** — direct index, bounds check | **Present** — `% length` wraps when simulator VUs shift IDs |
| task/assign "Domain missing username" | **Fixed** — uses `task/users` API response | **Present** — uses hardcoded `doctorName` |
| No default password on UAT | **Handled** — IMAP password reset flow | Not applicable (different environment may have defaults) |
| No diagnosis submission | **Gap** — workflow stops at viewing case | Covered |
| No WebSocket testing | **Gap** | Covered |

---

## 7. Recommendation — What to build next

### Must have (closes critical gaps)
1. **WebSocket/Socket.IO testing** — doctors depend on real-time notifications
2. **Diagnosis submission** (`POST /api/v2/diagnose`) — most critical business action
3. **Custom k6 metrics** — needed to pinpoint bottlenecks by phase

### Should have (improves quality)
4. **Grafana + InfluxDB dashboards** — real-time visibility during test runs
5. **Soak test** — catch memory leaks before production
6. **http.batch()** for dashboard calls — realistic parallel loading
7. **Health check script** — fast CI gate before full tests

### Nice to have (polish)
8. Browser tests (Chromium)
9. Probabilistic VU routing
10. Makefile for convenience
