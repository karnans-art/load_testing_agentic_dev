# Agentic Load Testing — Progress Tracker

> Living document. Update as tasks complete or new work is discovered.
> Format: `[x]` = done · `[ ]` = pending · `[~]` = in progress · `[!]` = blocked

---

## Platform Architecture ✅

- [x] Multi-app structure: `apps/<name>/` — each app self-contained
- [x] `runner/run-test.js` — orchestrator (`--app`, `--script`, `--setup N`, `--cloud`)
- [x] `runner/create-users.js` — standalone user creation (batch IMAP, random passwords, append mode)
- [x] `.env` — config (BASE_URL, cookies, k6 Cloud token, Gmail credentials)
- [x] `package.json` — npm scripts: `{scenario}:{app}` pattern
- [x] `CLAUDE.md` — constitution: production-rate simulation, app isolation, auth rules
- [x] `docker-compose.yml` — Grafana + InfluxDB monitoring stack
- [x] `grafana/` — pre-provisioned dashboard with 12 panels + endpoint dropdown
- [x] `.github/workflows/smoke-test.yml` — CI/CD: smoke test on push to main

---

## CDS App (ecg.tricog.com) ✅

### Auth & Session
- [x] Login: `POST /api/v2/login` with domainId, application, appVersion
- [x] `updateActive {isActive:1}` — marks doctor online
- [x] Per-VU token model — login once per VU, 401 auto-refresh
- [x] 1:1 VU-to-user mapping — direct index, no modulo, bounds check
- [x] Zero session collision — guaranteed, tested at 100 VUs
- [x] `token` header (not `Authorization: Bearer`)

### User Provisioning
- [x] 100 users created in `LoadTest3` domain — all verified working
- [x] `npm run create-users:cds` — standalone creation script
- [x] Batch IMAP (single connection for all reset tokens)
- [x] Random passwords per user (crypto.randomBytes)
- [x] Append mode — never overwrites existing users.json
- [x] `--setup N` — limits VUs to first N users from users.json
- [x] No provisioning during test runs — users pre-created separately

### Shared Libraries (`apps/cds/scripts/lib/`)
- [x] `cds-auth.js` — per-VU login, 1:1 mapping, bounds check, auto-refresh
- [x] `cds-workflow.js` — full doctor flow with `http.batch()`, shift payloads, custom metrics
- [x] `cds-metrics.js` — 18 custom metrics (dashboard, viewer, WebSocket, diagnosis, API health)
- [x] `cds-websocket.js` — Socket.IO handler (handshake, heartbeat, activity events, reconnect)

### Test Scenarios (9 total)
- [x] **Health check** (`npm run health:cds`) — 1 VU, ~5s, fast CI gate
- [x] **Smoke** (`npm run smoke:cds`) — 5 VUs default, 30s, quick validation
- [x] **Production load** (`npm run production:cds`) — WAF-weighted 109 req/min exact rate
- [x] **Peak 3x** (`npm run peak:cds`) — 3x production traffic
- [x] **Stress** (`npm run stress:cds`) — dynamic ramp (1x → 5x → 10x → 50% → max), scales with user count
- [x] **Soak** (`npm run soak:cds`) — 20 VUs, 2 hours endurance
- [x] **WebSocket** (`npm run websocket:cds`) — Socket.IO load test, verified working
- [x] **Full doctor flow** (`npm run full-flow:cds`) — probabilistic: 40% dashboard, 30% ECG, 15% filter, 15% multi-case + WebSocket
- [x] **Continuous diagnosis** (`npm run diagnosis:cds`) — case processing loop + WebSocket (POST /diagnose placeholder)

### Endpoints Tested (22 with individual checks)

**List Page (14):**
- [x] `POST /api/v2/login`
- [x] `POST /api/v2/updateActive`
- [x] `POST /api/v2/tasks/latest`
- [x] `POST /api/v2/tasks/count`
- [x] `POST /api/v2/tasks/v2`
- [x] `GET /api/v2/user`
- [x] `GET /api/v2/config`
- [x] `GET /api/v2/config/version/viewer`
- [x] `GET /api/v2/language`
- [x] `GET /api/v2/report/total/eta`
- [x] `GET /api/v2/report/doctor/active`
- [x] `POST /api/v2/report/doctor/avg` (with shift payload)
- [x] `POST /api/v2/report/day/avg` (with shift payload)
- [x] `GET /api/v2/getQueueLength`

**Per Task (8):**
- [x] `GET /api/v2/task/{id}/users?role=undefined`
- [x] `POST /api/v2/task/assign` (username from task/users response)
- [x] `GET /api/v2/nextEcg`
- [x] `GET /api/v2/tasks/{id}/algo`
- [x] `GET /api/v2/ecgData/{id}`
- [x] `GET /api/v2/patient/{id}`
- [x] `GET /api/v2/tasks/{id}/history/count`
- [x] `GET /api/v2/case/{id}/comments/history`

**Simulator:**
- [x] `POST /api/case/simulator` (ECG case injection)

**WebSocket:**
- [x] `WSS /api/v2/socket.io/` (Socket.IO: handshake, heartbeat, activity events)

### Verified Working
- [x] Smoke test — 100% pass, all 22 endpoint checks
- [x] Health check — 100% pass, 1 VU, ~5s
- [x] WebSocket test — 375 sessions, msgs flowing, p95 connect 230ms
- [x] Full doctor flow — 100% pass, probabilistic routing + WebSocket
- [x] User creation — 100 users in LoadTest3, all login verified
- [x] Simulator push — working with fresh TRICOG_ADMIN_COOKIE

### Custom Metrics
- [x] `cds_login_duration` — auth time
- [x] `cds_dashboard_load_duration` — full dashboard batch load
- [x] `cds_task_list_duration` — tasks/latest response time
- [x] `cds_ecg_viewer_load_duration` — viewer batch load
- [x] `cds_case_open_duration` — time to open a case
- [x] `cds_queue_check_duration` — queue length check
- [x] `cds_ws_connect_duration` — WebSocket connect time
- [x] `cds_ws_session_duration` — WebSocket session length
- [x] `cds_ws_ping_duration` — heartbeat round-trip
- [x] `cds_api_success_rate` — business-level success %
- [x] `cds_api_error_count` — error counter
- [x] `cds_cases_processed_count` — diagnosis loop counter

---

## Monitoring ✅

- [x] k6 Cloud — `--cloud` flag pushes results
- [x] Docker Compose — InfluxDB 1.8 + Grafana stack
- [x] Grafana dashboard — 12 panels (VUs, req/s, error rate, p50/p90/p95/p99, per-endpoint, dashboard load, viewer load, cases processed, WebSocket connect/ping/messages, checks pass rate, API success rate)
- [ ] Grafana verified with live data — needs `docker compose up` + test run with `--out influxdb`

---

## CI/CD

- [x] GitHub Actions — smoke test on push to main
- [ ] Health check as first CI gate
- [ ] Post-deployment trigger from CDS deploy pipeline
- [ ] Slack/Teams notification on failure

---

## Documentation

- [x] `specs/project-comparison.md` — gap analysis vs loadtest-cds100
- [x] `specs/cds-loadtest-comparison.html` — presentation-ready comparison
- [x] `docs/adoption-guide.html` — platform adoption guide (quick start, architecture, scenarios, provisioning, Grafana, CI/CD, troubleshooting)

---

## Pending / Known Gaps

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | `POST /api/v2/diagnose` | `[!]` Blocked | Need curl from DevTools. Placeholder in continuous-diagnosis.js |
| 2 | LoadTest3 domain report APIs | `[~]` Partial | Some report endpoints return errors — domain config may need update |
| 3 | IMAP dependency for user creation | `[x]` Required | UAT doesn't support default passwords — IMAP flow is necessary |
| 4 | Average load test (ramp→hold→ramp down) | `[ ]` Not built | Classic load profile missing |
| 5 | Spike test (0→max in 30s) | `[ ]` Not built | Sudden burst test missing |
| 6 | Breakpoint test (ramp until death) | `[ ]` Not built | Find absolute max capacity |
| 7 | Browser tests (Chromium) | `[ ]` Not built | Real DOM + Web Vitals |
| 8 | Response body validation | `[ ]` Not built | Only check status codes, not content |

---

## How to Run

```bash
# Quick validation
npm run health:cds
npm run smoke:cds

# With specific user count
npm run smoke:cds -- --setup 50
npm run stress:cds -- --setup 100 --cloud

# All scenarios
npm run production:cds          # WAF-weighted normal traffic
npm run peak:cds                # 3x production
npm run stress:cds              # ramp to breaking point
npm run soak:cds                # 2 hour endurance
npm run websocket:cds           # Socket.IO stress
npm run full-flow:cds           # realistic mixed behavior
npm run diagnosis:cds           # case processing loop

# User creation (one-time, separate from tests)
npm run create-users:cds -- --count 100 --domain LoadTest3 --prefix lt3
```
