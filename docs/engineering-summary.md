# CDS Load Testing Platform — Engineering Document

**Product:** Tricog ECG Clinical Decision Support (CDS)  
**Target:** `https://dev-new-ecg.tricogdev.net`  
**Framework:** k6 (Grafana) + Node.js runner  
**Repo:** `karnans-art/load_testing_agentic_dev`

---

## What Is This?

A production-grade load testing platform that simulates **real doctor behaviour** on the Tricog ECG diagnosis system. It does not fire random HTTP requests — it replicates the exact workflow a doctor follows: login → receive ECG cases → review → diagnose → repeat.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Load Test Platform                   │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Simulator   │    │      Doctor VUs          │   │
│  │  (Admin API) │───▶│  login → cases → diagnose│   │
│  │  Push ECGs   │    │  WebSocket + REST APIs   │   │
│  └──────────────┘    └──────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │           Shared Library (lib/)              │   │
│  │  cds-auth  cds-workflow  cds-simulator       │   │
│  │  cds-metrics  cds-websocket                  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼ Post-deploy trigger
┌─────────────────────┐
│  GitHub Actions CI   │
│  smoke → full-flow   │
└─────────────────────┘
```

---

## What Was Built

### 1. Shared Library (`apps/cds/scripts/lib/`)

| Module | Purpose |
|---|---|
| `cds-auth.js` | Per-VU login, token management, auto-refresh on 401 |
| `cds-workflow.js` | Full doctor workflow — dashboard, task fetch, case open, diagnosis |
| `cds-simulator.js` | Pushes ECG cases via admin panel (multipart CSI file upload) |
| `cds-websocket.js` | Socket.IO v3 — handshake, heartbeat, activity events |
| `cds-metrics.js` | 15+ custom k6 metrics — login, dashboard, viewer, WebSocket durations |

### 2. Test Scripts (`apps/cds/scripts/`)

| Script | Purpose | Duration | VUs |
|---|---|---|---|
| `health-check.js` | Server up? 6 core endpoints | ~5s | 1 |
| `smoke.js` | Basic doctor flow gate | 30s | 5–100 |
| `full-doctor-flow.js` | Realistic mixed behaviour | 5m | configurable |
| `continuous-diagnosis.js` | Back-to-back diagnosis loop | 5m | configurable |
| `production-load.js` | Exact WAF rate replay (109 req/min) | 10m | configurable |
| `peak-load.js` | 3× production rate | 10m | configurable |
| `stress-test.js` | Ramp to breaking point | 30m | configurable |
| `soak-test.js` | 2-hour endurance test | 2h | ≤20 |
| `websocket-test.js` | Socket.IO stress isolation | 3m | configurable |
| `simulator-push.js` | Admin panel ECG push only | configurable | configurable |

### 3. Invoker-Aware Routing

The system handles two doctor types automatically — no manual configuration needed:

```
Doctor logs in
  └─ task/users API call → detects isPreferred (auto, one-time)
       ├─ isPreferred: true  + INVOKER_ENABLED=true
       │    → tasks/latest (Invoker auto-assigns cases)
       │    → nextEcg → diagnose → loop
       │
       └─ isPreferred: false OR INVOKER_ENABLED=false
            → tasks/v2 UNDIAGNOSED → manual assign
            → nextEcg → diagnose → loop
```

Detection is cached per VU — zero extra API calls after first iteration.

### 4. Session Safety

| Rule | Implementation |
|---|---|
| 1 VU = 1 user, always | Index-based mapping, no modulo |
| No two tests simultaneously | Strict — shared user pool, one test at a time |
| Preferred doctors first | lt3121–lt3126 at top of `users.json` |
| 34 unique ECG fixtures | Rotated to avoid repeat-case stickiness in Invoker |

### 5. Post-Deploy Pipeline (`karnans-art/dummy-cds-app` → this repo)

```
CDS app deployed
  │
  └─ POST GitHub API (repository_dispatch)
       │
       └─ post-deploy-cds.yml fires
            ├─ Job 1: Smoke Test (30s gate)   → pass/fail
            └─ Job 2: Full Doctor Flow (5m)   → currently disabled, ready to enable
                 └─ Summary posted to GitHub Actions
```

**Trigger:** Any push to `karnans-art/dummy-cds-app` main  
**Manual:** GitHub Actions UI → workflow_dispatch

---

## Key Engineering Strengths

### Real Traffic, Not Random
Cases pushed via admin panel → Invoker distributes → doctors process. Mirrors production exactly.

### Invoker + Manual in One Script
Single `INVOKER_ENABLED` flag switches between auto-assign and manual-assign flows. Both paths maintained in `cds-workflow.js` — all scripts inherit both paths automatically.

### isPreferred Auto-Detection
The system detects whether a VU is a preferred doctor from the existing `task/users` API response — no hardcoding, no extra calls, cached for the test lifetime.

### Zero Session Collision Design
- Strict 1:1 VU-to-user mapping
- `multilogin: false` respected — no shared tokens
- Preferred doctors at index 0–5 for small `--setup N` runs

### WebSocket Fidelity
Full Socket.IO v3 protocol — handshake, `registerNotification`, 25s heartbeat, `clickEventEmiter` activity events. Matches real browser behaviour exactly.

### Graceful Teardown
All VUs logged out cleanly after every test — `updateActive(0)` + `logout` — releases Invoker stickiness and clears online presence from both tracking systems.

---

## How to Run

```bash
# Health check
node runner/run-test.js --app cds --script health-check

# Smoke (preferred doctors, Invoker ON)
INVOKER_ENABLED=true node runner/run-test.js --app cds --script smoke --setup 6

# Full doctor flow
INVOKER_ENABLED=true node runner/run-test.js --app cds --script full-doctor-flow --setup 6

# Continuous diagnosis
INVOKER_ENABLED=true node runner/run-test.js --app cds --script continuous-diagnosis --setup 6

# Push ECGs via admin panel (standalone)
TRICOG_ADMIN_COOKIE='...' SIMULATOR_VUS=2 PUSH_INTERVAL=120 npm run simulator:cds
```

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://dev-new-ecg.tricogdev.net` | Target server |
| `INVOKER_ENABLED` | `false` | Auto-assign vs manual-assign routing |
| `MAX_VUS` | all users | VU cap (set by runner via `--setup N`) |
| `TRICOG_ADMIN_COOKIE` | — | Admin panel session for simulator |
| `K6_CLOUD_TOKEN` | — | k6 Cloud dashboard output |

---

## GitHub Secrets

| Repo | Secret | Purpose |
|---|---|---|
| `load_testing_agentic_dev` | `BASE_URL` | UAT server URL |
| `load_testing_agentic_dev` | `K6_CLOUD_TOKEN` | k6 Cloud |
| `load_testing_agentic_dev` | `TRICOG_ADMIN_COOKIE` | Simulator auth |
| `dummy-cds-app` | `LOAD_TEST_DISPATCH_TOKEN` | Cross-repo trigger PAT |

---

## Open TODOs

| # | Item |
|---|---|
| 1 | Fix simulator rate cap in `full-doctor-flow.js` — `VU_COUNT×2` too aggressive at 100 VUs |
| 2 | Run `full-doctor-flow` standalone (6 preferred VUs) to get clean baseline result |
| 3 | Increase `teardownTimeout` — 100-user logout takes >60s |
| 4 | Enable full-flow job in `post-deploy-cds.yml` when ready |
