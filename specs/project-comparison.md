# CDS Load Testing — Gap Analysis

> Comparing **agentic-loadtesting** (ours) vs **loadtest-cds100** (Suresh's)

---

## At a Glance

| | Ours | Theirs |
|---|---|---|
| Endpoints | 23 | 26 |
| Scenarios | 4 | 6 |
| WebSocket | - | Yes |
| Browser tests | - | Yes |
| Grafana dashboards | - | Yes |
| Simulator push | Yes | - |
| Dynamic user setup + cleanup | Yes | - |
| Session collision fix | Yes | - |

---

## What we have that they don't

**Simulator integration** — `POST /api/case/simulator` injects ECG cases during tests. They have no case injection.

**Dynamic user provisioning** — `--setup N` creates N users (API + IMAP), runs the test, auto-deactivates after. Fully automated, single command. They have a manual script with no cleanup.

**Correct task/assign flow** — We call `task/users?role=undefined` first to get the right username. They hardcode `doctorName` which can fail with "Domain missing username".

**Production-rate weighted test** — WAF-based weighted random endpoint selection at exact production rates (109 req/min). They don't replicate production traffic patterns.

**Session collision fix** — Direct VU-to-user index with bounds check. They use modulo which causes collisions when simulator VUs shift IDs.

---

## What they have that we don't

### High priority

**WebSocket/Socket.IO testing** — Full Socket.IO load test with heartbeat pings, activity events (`clickEventEmiter`), and custom metrics (connect duration, ping latency, message counts). We don't test WebSocket at all.

**Diagnosis submission** — `POST /api/v2/diagnose` completes the full doctor workflow. We stop at viewing the case. They simulate the complete loop: open case, review 30-60s, submit diagnosis, fetch next.

**Custom k6 metrics** — Centralized metrics: `loginDuration`, `dashboardLoadDuration`, `ecgViewerLoadDuration`, `wsConnectDuration`, `casesProcessedCount`, `apiSuccessRate`. We only use default k6 metrics.

**Grafana + InfluxDB** — Docker Compose stack with pre-built dashboard: VU timeline, error rate by endpoint, p95 trends, WebSocket panels. We rely on k6 Cloud only.

### Medium priority

**Browser tests** — k6 Chromium tests for login flow and full user journey with real DOM interaction and Web Vitals (LCP, CLS).

**Soak test** — 20 VUs for 2 hours to catch memory leaks and degradation over time.

**Health check** — 1 VU, 1 iteration, 6 endpoints. Fast CI gate (~5s).

**`http.batch()` parallel calls** — Dashboard APIs called in one batch instead of sequentially.

**Probabilistic VU routing** — 40% dashboard review, 30% ECG case, 15% filter/search, 15% multi-case. Realistic traffic mix vs our uniform flow.

### Low priority

Makefile (30+ targets), Astro docs site (40+ pages), Biome + Husky (lint/format), API discovery scripts (Playwright), spike test (200 VUs in 30s), shift report payloads.

---

## Shared (both have)

k6 engine, same CDS endpoints, per-VU auth with `token` header, smoke/stress/peak scenarios, admin user creation via `/api/hubdoctor`, GitHub Actions CI, k6 Cloud integration, 401 auto-refresh.

---

## Known bug in their code

Multi-user test uses `sessions[(__VU - 1) % sessions.length]` — same modulo collision we identified and fixed. Two VUs can share one user when simulator VUs shift the ID range.
