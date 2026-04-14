# tests/cds100.js — Test Spec

## Overview
Self-contained k6 load test for CDS (ecg.tricog.com). Simulates a doctor's full workflow: login → list cases → diagnose each case in a loop.

## Flow

### Setup (runs once)
1. Push a case to `POST /api/case/simulator` on admin portal using `ADMIN_COOKIE`
2. If simulator push fails → abort all VUs (no point testing without tasks)

### Default (per VU, looped)
1. **Login** — per-VU auth, each VU logs in as its own user from `users.json`
2. **List Page** group — 12 API calls:
   - `tasks/latest`, `tasks/count`, `tasks/v2`
   - `user`, `config`, `config/version/viewer`, `language`
   - `report/total/eta`, `report/doctor/active`, `report/doctor/avg`, `report/day/avg`
   - `getQueueLength`
3. **Diagnosis Page** group — loops through ALL tasks returned by `tasks/latest`, 6 API calls each:
   - `nextEcg`, `tasks/{id}/algo`, `ecgData/{id}`, `patient/{id}/`
   - `tasks/{id}/history/count`, `case/{caseId}/comments/history`

### Teardown (runs once)
- Logs test completion

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Per-VU login (not in setup) | setup() token is shared read-only — causes session conflicts with multiple VUs |
| Diagnosis loops through ALL tasks | Simulates a doctor working through their queue, not just one case |
| Simulator push in setup | Ensures fresh tasks exist before VUs start diagnosing |
| Abort on simulator failure | No tasks = empty diagnosis loop = meaningless test |
| `ADMIN_COOKIE` as env var | Cookie expires — user pastes fresh cookie before each run |

## Config

| Param | Value | Source |
|-------|-------|--------|
| VUs | `users.json` length | 1 VU per user, no session conflicts |
| Duration | 20s | Configurable in `options` |
| `BASE_URL` | `https://uat-ecg.tricogdev.net` | env `BASE_URL` |
| `ADMIN_URL` | `https://uat-admin.tricogdev.net` | env `ADMIN_URL` |
| `ADMIN_COOKIE` | manual paste | env `ADMIN_COOKIE` or edit line 10 |
| `.csi` file | `apps/cds/fixtures/sample.csi` | Uploaded ECG data for simulator |

## Run

```bash
# With env var cookie
ADMIN_COOKIE='tricogadmin=s%3A...' k6 run tests/cds100.js

# Or edit ADMIN_COOKIE in the file, then:
k6 run tests/cds100.js
```

## Pending
- [ ] Add simulator push to `apps/cds/scripts/smoke.js`
- [ ] Automate admin cookie refresh (Playwright sign-in) if needed for CI
