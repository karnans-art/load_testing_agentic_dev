// CDS — Continuous Diagnosis Flow
// Power user: doctor processes undiagnosed cases in a loop.
// Flow: dashboard → nextEcg → open case → review 30-45s → POST /diagnose → repeat
//
// POST /api/v2/diagnose is fully implemented (TEXT-based diagnosis for LoadTest3).
//
// Run: npm run diagnosis:cds

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { authHeaders, isLoggedIn, getUser, getBaseUrl } from './lib/cds-auth.js'
import { openWebSocket } from './lib/cds-websocket.js'
import { randomSleep, diagnoseTask, logoutAllDoctors } from './lib/cds-workflow.js'
import { simulatorPush } from './lib/cds-simulator.js'
import {
  dashboardLoadDuration, caseOpenDuration, diagnosisReviewDuration,
  diagnosisSubmitDuration, casesProcessedCount, apiSuccessRate, apiErrorCount,
} from './lib/cds-metrics.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length

const INVOKER_ENABLED = (__ENV.INVOKER_ENABLED || 'false').toLowerCase() === 'true'

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            Math.max(6, VU_COUNT * 2),  // 2 cases/min per VU to keep queue fed
      timeUnit:        '1m',
      duration:        '5m',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simPush',
    },
    doctors: {
      executor:    'ramping-vus',
      startVUs:    0,
      stages: [
        { duration: '20s', target: VU_COUNT },
        { duration: '3m',  target: VU_COUNT },
        { duration: '20s', target: 0 },
      ],
      exec: 'diagnosisLoop',
      startTime: '2s',
    },
  },
  thresholds: {
    http_req_failed:              ['rate<0.11'],
    http_req_duration:            ['p(95)<3000'],
    cds_case_open_duration:       ['p(95)<4000'],
    cds_ws_connect_duration:      ['p(95)<3000'],
    checks:                       ['rate>0.90'],
  },
}

export function simPush() { simulatorPush() }

export function diagnosisLoop() {
  let h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return

  const QUEUE_SIZE = 2  // matches domain config queue_length
  const MAX_CYCLES = 5  // max cycles per iteration to prevent infinite loops

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    // ── Step 1: Dashboard Load (doctor returns to home page) ──
    group('Dashboard', () => {
      const start = Date.now()
      http.batch([
        ['GET', `${BASE_URL}/api/v2/config`, null, { headers: h, tags: { name: 'config' } }],
        ['GET', `${BASE_URL}/api/v2/language`, null, { headers: h, tags: { name: 'language' } }],
        ['GET', `${BASE_URL}/api/v2/user`, null, { headers: h, tags: { name: 'user' } }],
        ['GET', `${BASE_URL}/api/v2/getQueueLength`, null, { headers: h, tags: { name: 'getQueueLength' } }],
        ['GET', `${BASE_URL}/api/v2/report/doctor/active`, null, { headers: h, tags: { name: 'report/doctor/active' } }],
        ['GET', `${BASE_URL}/api/v2/report/total/eta`, null, { headers: h, tags: { name: 'report/total/eta' } }],
      ])
      dashboardLoadDuration.add(Date.now() - start)
    })

    // Mark doctor active (triggers queue refresh + Invoker assignment)
    http.post(`${BASE_URL}/api/v2/updateActive`,
      JSON.stringify({ isActive: 1, captureEvent: false }),
      { headers: h, tags: { name: 'updateActive' } })

    // ── Step 2: Get undiagnosed cases (max queue_length) ───────
    let tasks = []
    group('Fetch Cases', () => {
      // Always fetch undiagnosed cases — works with both Invoker ON and OFF
      const undiagRes = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: QUEUE_SIZE, stage: 'UNDIAGNOSED', taskTypes: 'RESTING' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers: h, tags: { name: 'tasks/v2-undiagnosed' } })
      try {
        const body = undiagRes.json()
        tasks = (body.tasks || body || []).filter(t => t && t.taskId && t.taskId !== 'undefined')
      } catch (_) {}
    })

    if (tasks.length === 0) {
      console.log(`[VU${__VU}] Cycle ${cycle}: no cases — stopping`)
      break
    }

    // ── Step 3: Process each case (max 2) ─────────────────────
    for (const task of tasks.slice(0, QUEUE_SIZE)) {
      group(`Diagnose Case`, () => {
        // Assign if not already assigned to this doctor
        if (!task.assignedAt) {
          const usersRes = http.get(`${BASE_URL}/api/v2/task/${task.taskId}/users?role=undefined`, { headers: h, tags: { name: 'task/users' } })
          let assignable = []
          try { assignable = usersRes.json().users || [] } catch (_) {}
          const me = assignable.find(u => u.username.toLowerCase() === user.username.toLowerCase())
          if (me) {
            http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({
              assignments: [{ username: me.username, taskId: task.taskId, role: 'DOCTOR' }],
            }), { headers: h, tags: { name: 'task/assign' } })
          }
        }

        // Open case
        const caseId = task.caseId || task.taskId
        http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt || ''}`, { headers: h, tags: { name: 'nextEcg' } })

        const openStart = Date.now()
        http.batch([
          ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers: h, tags: { name: 'ecgData' } }],
          ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers: h, tags: { name: 'patient' } }],
          ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, null, { headers: h, tags: { name: 'tasks/algo' } }],
          ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, null, { headers: h, tags: { name: 'tasks/history/count' } }],
          ['GET', `${BASE_URL}/api/v2/case/${caseId}/comments/history`, null, { headers: h, tags: { name: 'case/comments/history' } }],
        ])
        caseOpenDuration.add(Date.now() - openStart)

        // Review with WebSocket
        const reviewStart = Date.now()
        openWebSocket(h.token, 5, 'ecg_review')
        diagnosisReviewDuration.add(Date.now() - reviewStart)

        // Submit diagnosis
        diagnoseTask(task.taskId, user.username)
      })

      randomSleep(1, 2)
    }

    // ── Step 4: Back to dashboard (next cycle) ────────────────
    randomSleep(1, 2)
  }

  randomSleep(1, 3)
}

export function setup() {
  console.log(`Starting continuous diagnosis — ${VU_COUNT} doctor VUs`)
}

export function teardown() {
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('Continuous diagnosis complete')
}
