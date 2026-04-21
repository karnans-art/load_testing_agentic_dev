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

The **Invoker** is a backend service that automatically assigns incoming ECG cases to available doctors. It is a **domain-level setting** — enabled per domain, not globally.

**Current state:** Enabled on LoadTest3 but not auto-assigning new cases (under investigation).

### Repeat Case Logic (Critical for Load Testing)

The backend has a **repeat case detection** system. It analyzes the ECG content — specifically `caseId` and `patientId` inside the case data — to determine if an incoming ECG is a repeat of a previously submitted case.

When the system detects a repeat case:

- It does NOT assign to a random available doctor
- It **routes back to the previously assigned doctor** who handled that patient/case before
- It waits for that specific doctor to diagnose before releasing the slot
- This is a product feature to ensure continuity of care — the same doctor follows up on the same patient

**Impact on load testing:**
- We push the same `sample.csi` file repeatedly — the backend sees identical ECG content
- Same content = same patient/case identifiers = repeat case
- All repeat cases route to the SAME doctor
- Other 99 doctors sit idle with empty queues
- This is why we see 200+ cases in the queue but the Invoker only assigns to one doctor

**This is NOT caused by:**
- Same device ID (device ID doesn't trigger repeat detection)
- Same center ID (center is just routing, not repeat logic)

**To fix for load testing:**
- Need multiple different ECG sample files with unique patient/case data — **DONE: 34 unique files in fixtures/**
- Simulator now rotates through all files via `cds-simulator.js`
- If previously assigned doctor is **offline**, stickiness releases and Invoker assigns to an active doctor

### WebSocket Presence (Critical Discovery)

The Invoker does NOT use `updateActive` API alone to determine if a doctor is online. It requires an **active WebSocket connection** (Socket.IO) as the real presence signal.

**Verified by testing:**
- `updateActive` only (no WebSocket) → `report/doctor/active` shows `activeSum: 0` → Invoker does NOT assign cases
- `updateActive` + WebSocket connection → doctor appears active → Invoker assigns cases → `nextEcg` returns cases

**Impact on load test scripts:**

| Script | Has WebSocket? | Invoker works? | Action needed |
|--------|---------------|---------------|---------------|
| `smoke.js` | No | No — Invoker won't assign | TODO: Add background WebSocket |
| `peak-load.js` | No | No | TODO: Add background WebSocket |
| `stress-test.js` | No | No | TODO: Add background WebSocket |
| `soak-test.js` | No | No | TODO: Add background WebSocket |
| `full-doctor-flow.js` | Yes | Yes — confirmed working | No change needed |
| `continuous-diagnosis.js` | Yes (per case) | Partial — only active during review | TODO: Keep WebSocket open throughout |
| `websocket-test.js` | Yes | Yes — but no case processing | No change needed |

### Invoker Still Not Assigning (Under Investigation)

Even with WebSocket active + `updateActive` + fresh doctor (zero history):
- `nextEcg?id=init` returns `{ nextEcgDetails: false }`
- `tasks/latest` returns 0 undiagnosed
- Meanwhile `tasks/v2 UNDIAGNOSED` shows 10+ cases sitting unassigned
- Queue has 6+ cases

**Verified findings:**
- `nextEcg?id=init` returns `false` even after diagnosis — no auto-feed of next case
- Invoker does not assign new cases to load test doctors (even with WebSocket active)
- After diagnosing, doctor must go back to dashboard and pick the next case manually

**Confirmed working flow (manual assign with queue auto-feed):**
```
Dashboard → tasks/v2 UNDIAGNOSED → pick 2 cases → assign both
→ nextEcg?id=init → returns case 1 → diagnose case 1
→ nextEcg?id=init → returns case 2 automatically! (no dashboard needed)
→ diagnose case 2 → queue empty
→ BACK TO DASHBOARD → assign 2 more → repeat
```

**Key discovery:** `nextEcg?id=init` auto-feeds the next assigned case after diagnosis.
- Doctor assigns 2 cases (queue_length: 2)
- After diagnosing case 1, `nextEcg?id=init` immediately returns case 2
- Back-to-back processing works WITHOUT Invoker
- Doctor only returns to dashboard when queue is empty
- WebSocket is NOT required for this — it's a server-side queue mechanism
- Verified: 2 cases assigned, case 1 diagnosed, case 2 auto-returned via nextEcg

**Root cause found (from Invoker logs):**
```
"GroupIds is missing for a doctor ID - 395, group ids are "
```
The Invoker requires doctors to be in an **assignment group** (groupId). Our load test doctors were created without groupIds. The Invoker sees them online but can't assign because group matching fails.

**Fix:** Add load test doctors to an assignment group in the admin portal. The domain config has `default_assignment_profile` with profile IDs — doctors need to be linked to these profiles.

**Current recommendation:** Use manual assign flow until doctors are added to assignment groups. The `INVOKER_ENABLED` toggle exists for when this is configured.

### Logout Gap — Doctors Still Show Online

After teardown, `report/doctor/active` shows `activeSum: 0` but the `task/{id}/users?role=` API still shows doctors as online in the browser assign dialog.

**Two separate presence systems:**

| System | How it tracks | Our logout clears it? |
|--------|-------------|----------------------|
| `report/doctor/active` | `updateActive` API call | Yes — `isActive: 0` |
| `task/{id}/users` (isActive) | WebSocket connection presence | Partial — open+close might not be enough |

**The gap:** The WebSocket presence might need a proper Socket.IO disconnect sequence, not just open+close. The browser sends a disconnect message before closing. Our teardown might need to send the Socket.IO disconnect frame (`41`) before closing.

**Debug API:** Use `GET /api/v2/task/{taskId}/users?role=` to check which doctors the server considers online. This shows `isActive` and `sessionId` per doctor.

**VERIFIED (2026-04-21):**

1. **Logout clears presence** — CONFIRMED. After `updateActive:0` + `POST /logout {inactive:false}`, doctor disappears from `task/{id}/users` online list. No need for Socket.IO `41` frame — API logout is sufficient.

2. **Auto-queue without Invoker — NO.** After manually assigning 1 case and diagnosing it, `nextEcg?id=init` returns `false`. The system does NOT auto-fill the doctor's queue. Every case must be explicitly assigned.
   - The back-to-back `nextEcg` only works when **multiple cases are pre-assigned** (e.g., assign 2 upfront, diagnose case 1, `nextEcg` returns case 2)
   - After all pre-assigned cases are diagnosed, queue is empty — doctor must return to dashboard and assign more

**Final confirmed flow:**
```
Dashboard → tasks/v2 UNDIAGNOSED → assign queue_length cases (2)
→ nextEcg?id=init → case 1 → diagnose
→ nextEcg?id=init → case 2 (pre-assigned) → diagnose
→ queue empty → BACK TO DASHBOARD → assign 2 more → repeat
```

**TODO: Add persistent WebSocket to all doctor workflows**

When `INVOKER_ENABLED=true`, each doctor VU should:
1. Login + `updateActive`
2. Open a **persistent WebSocket** connection (kept alive throughout the test)
3. Process cases (Invoker assigns via the WebSocket presence)
4. Close WebSocket only at teardown

This is how the real browser works — the WebSocket stays open the entire time the doctor has the app open. The Invoker uses it as a heartbeat.

**Implementation approach:**
- Add a `keepAliveWebSocket(token)` function to `cds-websocket.js` that opens a long-lived connection
- In each VU's first iteration, open the WebSocket
- Keep it alive across iterations (VU-local state)
- Close in teardown via `doLogout()`
- This must be done carefully to avoid resource leaks — the WebSocket must be properly closed when the VU exits

### Two flows depending on Invoker

#### Invoker OFF (current — manual assign)

```
Simulator pushes case → sits unassigned in queue
Doctor calls tasks/v2 (ALL view) → sees unassigned case
  → task/users?role=undefined → get assignable doctors
  → task/assign (with username from task/users response)
  → nextEcg?id=xxx&assignedAt=xxx → open specific case
  → ecgData, patient, algo, history, comments
```

- `tasks/latest` returns EMPTY (no cases assigned to this doctor)
- `GET /nextEcg` without params returns 400 (no Invoker to pick next case)
- Workflow falls back to `tasks/v2` → manual assign → view

#### Invoker ON (after PR approved — auto-assign)

```
Simulator pushes case → Invoker auto-assigns to available doctor
Doctor calls nextEcg (no params) → server returns next auto-assigned case
  → ecgData, patient, algo, history, comments
```

- `tasks/latest` returns cases (Invoker assigned them to this doctor)
- `GET /nextEcg` without params WORKS — server picks next case
- No need for `task/users` → `task/assign` (already assigned by Invoker)

### TODO: INVOKER_ENABLED toggle (pending PR approval)

When Invoker is enabled on LoadTest3, add to `.env`:

```
INVOKER_ENABLED=true
```

This toggle must change the workflow in `cds-workflow.js`:

| | INVOKER_ENABLED=false | INVOKER_ENABLED=true |
|---|---|---|
| Find cases | `tasks/v2` (ALL view) | `nextEcg` (no params) |
| Assign | `task/users` → `task/assign` (manual) | Skip (Invoker did it) |
| Open case | `nextEcg?id=xxx&assignedAt=xxx` | Response from `nextEcg` already has the case |
| tasks/latest | Empty (no use) | Shows assigned cases |

**Implementation steps when PR is approved:**
1. Add `INVOKER_ENABLED` to `.env`
2. Update `cds-workflow.js` — read env var, switch between manual and auto flow
3. Update `full-doctor-flow.js` — ECG case review path uses `nextEcg` directly
4. Update `continuous-diagnosis.js` — full loop: `nextEcg` → review → diagnose → next
5. Test both paths: run with `INVOKER_ENABLED=true` and `false`
6. Update knowledge base with results
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
