# CDS Load Testing — Knowledge Base

## Product: CDS (Clinical Decision Support)

CDS is the ECG doctor workflow application at `uat-ecg.tricogdev.net`. Doctors login, view assigned ECG cases, review waveforms, and submit diagnoses.

---

## 1. How Users Are Created

### Admin Portal

Users are created via the **Atlas Admin Portal** at `uat-ecg-atlasadmin.tricogdev.net`.

```
API:     POST /api/hubdoctor
Auth:    Cookie: tlas=<session>
Header:  domain: LoadTest3
```

Each user is created as a DOCTOR with:
- username (e.g., `lt3026`)
- email alias (e.g., `karnan.s+lt3026@tricog.com`)
- role: DOCTOR
- timezone: Asia/Kolkata
- privileges: viewCase=ALL, assignment=ALL

### Password Reset Flow

The admin portal does NOT set a password on creation. Instead:
1. Server sends a password reset email to the alias address
2. We read the email via IMAP (Gmail)
3. Extract the reset token from the email body
4. Call `POST /api/v2/password/update` with the token + chosen password

### Our Automation

```
npm run create-users:cds -- --count 100 --domain LoadTest3 --prefix lt3
```

This runs `runner/create-users.js` which:
1. Reads `CDS_ADMIN_COOKIE` from `.env` (tlas cookie)
2. Creates users in batches of 5-10
3. Opens single IMAP connection to Gmail
4. Batch-fetches all reset emails
5. Sets random password per user (crypto.randomBytes)
6. Appends to `apps/cds/users.json`

### Current State

- **100 users** in `LoadTest3` domain (`lt3026`-`lt3100`, `lt3101`-`lt3126`)
- All verified: 100/100 login success
- Stored in `apps/cds/users.json` with random passwords

### Important Rules

- `users.json` is never modified during test runs
- Users are never deactivated after tests
- Each VU gets a unique user (1:1 mapping, no modulo, no collision)

---

## 2. How the Simulator Works

### What It Does

The simulator pushes ECG case files into the system so doctors have cases to work on during load tests. Without the simulator, doctors would see empty task lists.

### Admin Portal (Simulator)

Different domain from user creation:

```
API:     POST /api/case/simulator
URL:     https://uat-admin.tricogdev.net
Auth:    Cookie: tricogadmin=<session>
```

### Payload

```
centerId:  3520
caseType:  RESTING
clientUrl: http://cloud-server/simulate
deviceId:  HE-BE68A686
file:      sample.csi (binary ECG file from apps/cds/fixtures/)
```

### In Load Tests

Every test script runs a simulator scenario alongside the doctor scenario:

```
simulator: constant-arrival-rate, 6 cases/min
doctors:   starts 2s after simulator (head start to push cases)
```

### Cookies Required

| Cookie | Domain | Purpose | Env var |
|--------|--------|---------|---------|
| `tlas` | `uat-ecg-atlasadmin.tricogdev.net` | User creation | `CDS_ADMIN_COOKIE` |
| `tricogadmin` | `uat-admin.tricogdev.net` | Simulator push | `TRICOG_ADMIN_COOKIE` |

Both expire — refresh from browser DevTools when they stop working.

---

## 3. Admin Portal Settings

### Domain: LoadTest3

Created specifically for load testing. Key config (from login response):

| Setting | Value | Impact |
|---------|-------|--------|
| `autoAssignment` | 1 | Config says enabled, but see Invoker note below |
| `user_count` | 200 | Max concurrent sessions |
| `web_platform_access.count` | 200 | Web login limit |
| `multilogin` | false | One session per user (why 1:1 VU mapping is critical) |
| `queue_length` | 2 | Cases in assignment queue |
| `inactivity_logout` | 1 | Kicks idle doctors |
| `unassign_on_logout` | 1 | Unassigns cases on logout |

### Invoker (Auto-Assignment Service)

The **Invoker** is a backend service that automatically assigns incoming ECG cases to available doctors. It is:

- **Enabled on default/production domains** — cases arrive and get auto-assigned to doctors. Doctors see cases in their list without manual action.
- **NOT enabled on LoadTest3** — since this is a custom load testing domain, the Invoker does not run. Cases pushed by the simulator are NOT auto-assigned.

**Impact on load tests:**
- Doctors must **manually assign** cases to themselves: `task/users?role=undefined` → `task/assign`
- The parameterless `GET /nextEcg` (auto-assign) returns 400 — confirmed by testing
- All our test scripts use the manual assign flow, which is correct for LoadTest3
- If Invoker were enabled, tasks/latest would show pre-assigned cases and the `task/assign` step could be skipped

**This is why:**
- `cds-workflow.js` calls `task/users` → `task/assign` before every case view
- `continuous-diagnosis.js` cannot use parameterless `nextEcg` on LoadTest3
- The full doctor flow works because it reads from `tasks/latest` (already assigned cases from previous runs)
| `assignmentCutoffMinutes` | 40 | Timeout for assignment |

### Why multilogin=false matters

The server invalidates the first session when the same user logs in again. This is why:
- We use 1:1 VU-to-user mapping
- No modulo in user index
- `--setup N` caps VUs to N users

---

## 4. Doctor Workflow (What the Tests Simulate)

### Real User Flow

```
Doctor opens browser
  → Login (POST /api/v2/login)
  → Mark active (POST /api/v2/updateActive)
  → Dashboard loads (7 parallel API calls)
  → See task list (POST /api/v2/tasks/latest)
  → Pick a case
    → Fetch assignable doctors (GET /api/v2/task/{id}/users?role=undefined)
    → Assign to self (POST /api/v2/task/assign)
    → Open case (GET /nextEcg?id=xxx)
    → Load ECG data (5 parallel API calls)
    → Review waveform (30-60 seconds)
    → Submit diagnosis (POST /api/v2/diagnose) ← NOT YET IMPLEMENTED
  → Back to task list
  → Repeat
```

### API Calls Per Iteration

**List Page (batch — parallel):**
- `POST /api/v2/tasks/latest` — doctor's assigned/diagnosed cases
- `POST /api/v2/tasks/count` — case counts
- `POST /api/v2/tasks/v2` — all cases with filters
- `GET /api/v2/user` — logged-in user profile
- `GET /api/v2/config` — domain config
- `GET /api/v2/config/version/viewer` — viewer version
- `GET /api/v2/language` — i18n strings
- `GET /api/v2/report/total/eta` — queue ETA
- `GET /api/v2/report/doctor/active` — active doctors
- `POST /api/v2/report/doctor/avg` — doctor averages (with shift payload)
- `POST /api/v2/report/day/avg` — daily averages (with shift payload)
- `GET /api/v2/getQueueLength` — queue depth

**Per Task (batch — parallel):**
- `GET /api/v2/task/{id}/users?role=undefined` — assignable doctors
- `POST /api/v2/task/assign` — assign using username from above response
- `GET /api/v2/nextEcg?id={id}&assignedAt={ts}` — open the case
- `GET /api/v2/tasks/{id}/algo` — algorithm results
- `GET /api/v2/ecgData/{id}` — ECG waveform data
- `GET /api/v2/patient/{id}` — patient info
- `GET /api/v2/tasks/{id}/history/count` — case history
- `GET /api/v2/case/{caseId}/comments/history` — comments

**WebSocket (Socket.IO):**
- `WSS /api/v2/socket.io/?channel={token}&EIO=3&transport=websocket`
- Heartbeat ping every 25s
- Activity events (`clickEventEmiter`) every 10s

### What nextEcg Requires on LoadTest3

```
GET /api/v2/nextEcg?id={taskId}&assignedAt={assignedAt}
```

The parameterless `GET /nextEcg` (auto-assign) returns **400 "Invalid inputs"** on LoadTest3 because the **Invoker** (auto-assignment service) is not enabled on this custom domain.

On production domains where the Invoker runs, `GET /nextEcg` without params works — the server picks the next undiagnosed case from the queue. On LoadTest3, doctors must:
1. Get task list via `tasks/latest`
2. Call `task/users?role=undefined` to get assignable doctors
3. Call `task/assign` with the correct username
4. Then call `nextEcg?id=xxx&assignedAt=xxx` with the specific task

---

## 5. How `npm run full-flow:cds -- --setup 20 --cloud` Works

### Step by step

**1. Runner parses args**
```
run-test.js receives:
  --app cds
  --script full-doctor-flow
  --setup 20
  --cloud
```

**2. Load users**
```
Reads apps/cds/users.json (100 users)
--setup 20 → passes MAX_VUS=20 to k6
Only first 20 users will be used
```

**3. k6 starts two scenarios**

```
Scenario 1: simulator
  executor: constant-arrival-rate
  rate: 6 cases/min
  duration: 5 min
  Pushes ECG files via POST /api/case/simulator

Scenario 2: doctors
  executor: ramping-vus
  stages:
    0 → 20 VUs (1 min ramp up)
    hold 20 VUs (3 min)
    20 → 0 VUs (1 min ramp down)
  Each VU = 1 unique user from users.json
```

**4. Each doctor VU on every iteration**

```
Roll random number 0-1:

  0.00 - 0.40 → Dashboard Review (40% chance)
    ├── batch: config, language, version, user, queue, reports (parallel)
    ├── open 5s WebSocket session
    └── sleep 2-5s

  0.40 - 0.70 → ECG Case Review (30% chance)
    ├── tasks/latest → pick first task
    ├── batch: nextEcg, algo, ecgData, patient, history, comments (parallel)
    ├── open 30-60s WebSocket session
    └── sleep 1-3s

  0.70 - 0.85 → Filter/Search (15% chance)
    ├── tasks/v2 (all cases)
    ├── sleep 1-2s
    ├── tasks/v2 (filtered)
    └── tasks/v2 (page 2)

  0.85 - 1.00 → Multi-Case Review (15% chance)
    ├── tasks/latest → get list
    └── loop 3 cases: nextEcg + ecgData + patient (parallel)
```

**5. Results pushed to k6 Cloud**

`--cloud` adds `--out cloud` to the k6 command. Results appear in your k6 Cloud dashboard with:
- VU timeline
- Request rate
- Error rate
- p50/p90/p95/p99 response times
- Per-endpoint breakdown
- Custom metrics (dashboard load, viewer load, WebSocket connect)

**6. After 5 minutes**

k6 exits. No user cleanup. No temp files. Users remain in users.json for next run.

### Visual timeline

```
Time:  0s        1m        2m        3m        4m        5m
       |---------|---------|---------|---------|---------|
Sim:   ████████████████████████████████████████████████████  6 cases/min
VUs:   ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲
       0→20      hold 20 VUs                          20→0

Each VU per iteration:
  VU1:  [dashboard]     [ecg review...30s ws...]  [filter]    [dashboard]
  VU2:  [ecg review...45s ws...]  [multi-case]   [dashboard]  [filter]
  VU3:  [dashboard]     [dashboard]  [ecg review...35s ws...] [multi-case]
  ...random per iteration
```

---

## 6. Quick Reference

### Run commands

```bash
npm run health:cds                        # 1 VU, 5s
npm run smoke:cds                         # 5 VUs, 30s
npm run smoke:cds -- --setup 20           # 20 VUs, 30s
npm run full-flow:cds -- --setup 20       # 20 VUs, 5m, mixed + WebSocket
npm run stress:cds -- --setup 100 --cloud # 100 VUs, 30m, ramp to max
npm run soak:cds -- --setup 20            # 20 VUs, 2 hours
```

### Create users

```bash
npm run create-users:cds -- --count 100 --domain LoadTest3 --prefix lt3
```

### Refresh expired cookies

1. Open `uat-admin.tricogdev.net` → DevTools → copy `tricogadmin` cookie → update `.env` `TRICOG_ADMIN_COOKIE`
2. Open `uat-ecg-atlasadmin.tricogdev.net` → DevTools → copy `tlas` cookie → update `.env` `CDS_ADMIN_COOKIE`
