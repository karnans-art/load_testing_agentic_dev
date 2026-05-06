// CDS — Continuous Diagnosis Flow
//
// INVOKER_ENABLED=true  → Invoker flow:
//   Dashboard ONCE → loop [ tasks/latest → diagnose all back-to-back → tasks/latest ] → repeat
//   No simulator scenario — push cases separately via: npm run simulator:cds
//
// INVOKER_ENABLED=false → Manual flow (default):
//   Dashboard → tasks/v2 UNDIAGNOSED → manual assign → diagnose → repeat
//
// Run:               npm run diagnosis:cds
// With Invoker:      INVOKER_ENABLED=true npm run diagnosis:cds
// Limit VUs:         MAX_VUS=6 INVOKER_ENABLED=true npm run diagnosis:cds

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

const USERS         = JSON.parse(open('../users.json')).users
const MAX_VUS       = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT      = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length
const INVOKER_ENABLED = (__ENV.INVOKER_ENABLED || 'false').toLowerCase() === 'true'

export const options = {
  scenarios: {
    // Simulator only runs in manual flow — Invoker flow pushes cases separately
    ...(INVOKER_ENABLED ? {} : {
      simulator: {
        executor:        'constant-arrival-rate',
        rate:            Math.max(6, VU_COUNT * 2),
        timeUnit:        '1m',
        duration:        '5m',
        preAllocatedVUs: 1,
        maxVUs:          2,
        exec:            'simPush',
      },
    }),
    doctors: {
      executor:    'ramping-vus',
      startVUs:    0,
      stages: [
        { duration: '20s', target: VU_COUNT },
        { duration: '3m',  target: VU_COUNT },
        { duration: '20s', target: 0 },
      ],
      exec:      'diagnosisLoop',
      startTime: INVOKER_ENABLED ? '0s' : '2s',
    },
  },
  thresholds: {
    http_req_failed:         ['rate<0.11'],
    http_req_duration:       ['p(95)<3000'],
    cds_case_open_duration:  ['p(95)<4000'],
    cds_ws_connect_duration: ['p(95)<3000'],
    checks:                  ['rate>0.90'],
  },
}

export function simPush() { simulatorPush() }

export function diagnosisLoop() {
  let h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const BASE_URL = getBaseUrl()
  const user     = getUser()
  if (!user) return

  if (INVOKER_ENABLED && user.isPreferred === true) {
    invokerFlow(h, BASE_URL, user)
  } else {
    // also handles first-time detection of isPreferred via task/users call
    manualFlow(h, BASE_URL, user)
  }

  randomSleep(1, 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOKER FLOW
// Dashboard once → loop [ tasks/latest → diagnose all back-to-back → repeat ]
// ─────────────────────────────────────────────────────────────────────────────
function invokerFlow(h, BASE_URL, user) {

  // ── Dashboard: load ONCE at VU start ─────────────────────────
  group('Dashboard', () => {
    const start = Date.now()
    http.batch([
      ['GET', `${BASE_URL}/api/v2/config`,               null, { headers: h, tags: { name: 'config' } }],
      ['GET', `${BASE_URL}/api/v2/language`,              null, { headers: h, tags: { name: 'language' } }],
      ['GET', `${BASE_URL}/api/v2/user`,                  null, { headers: h, tags: { name: 'user' } }],
      ['GET', `${BASE_URL}/api/v2/getQueueLength`,        null, { headers: h, tags: { name: 'getQueueLength' } }],
      ['GET', `${BASE_URL}/api/v2/report/doctor/active`,  null, { headers: h, tags: { name: 'report/doctor/active' } }],
      ['GET', `${BASE_URL}/api/v2/report/total/eta`,      null, { headers: h, tags: { name: 'report/total/eta' } }],
    ])
    dashboardLoadDuration.add(Date.now() - start)
  })

  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: h, tags: { name: 'updateActive' } })

  // ── Main loop: tasks/latest → diagnose all → loop back ───────
  const MAX_CYCLES = 20

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    h = authHeaders()  // refresh on each cycle (handles token expiry)

    const latestRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: {
        doctorName: user.doctorName,
        pageNo:     1,
        perPage:    25,
        stage:      'ASSIGNED_DIAGNOSED',
        taskTypes:  'RESTING',
      },
      sortBy: {
        datetime:   { enable: false },
        timeread:   { enable: true,  order: 'DESC' },
        assignedAt: { enable: true,  order: 'DESC' },
      },
    }), { headers: h, tags: { name: 'tasks/latest' } })

    let tasks = []
    try {
      const body = latestRes.json()
      const all  = body.tasks || body || []
      if (Array.isArray(all)) {
        // Only pick cases not yet diagnosed
        tasks = all.filter(t => t && t.taskId && t.taskId !== 'undefined' && t.stage !== 'DIAGNOSED')
      }
    } catch (_) {}

    if (tasks.length === 0) {
      console.log(`[VU${__VU}][cycle ${cycle}] no Invoker-assigned cases — waiting 3s then retrying tasks/latest`)
      sleep(3)
      continue
    }

    console.log(`[VU${__VU}][cycle ${cycle}] Invoker assigned ${tasks.length} case(s) — diagnosing back-to-back`)

    // ── Diagnose every case — NO dashboard between them ──────
    for (const task of tasks) {
      group('Diagnose Case', () => {

        // Open case
        http.get(
          `${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt || ''}`,
          { headers: h, tags: { name: 'nextEcg' } }
        )

        // Load all case data in parallel
        const caseId   = task.caseId || task.taskId
        const openStart = Date.now()
        http.batch([
          ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`,             null, { headers: h, tags: { name: 'ecgData' } }],
          ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`,             null, { headers: h, tags: { name: 'patient' } }],
          ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`,           null, { headers: h, tags: { name: 'tasks/algo' } }],
          ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`,  null, { headers: h, tags: { name: 'tasks/history/count' } }],
          ['GET', `${BASE_URL}/api/v2/case/${caseId}/comments/history`,     null, { headers: h, tags: { name: 'case/comments/history' } }],
        ])
        caseOpenDuration.add(Date.now() - openStart)

        // Review via WebSocket
        const reviewStart = Date.now()
        openWebSocket(h['token'], 5, 'ecg_review')
        diagnosisReviewDuration.add(Date.now() - reviewStart)

        // Submit diagnosis
        diagnoseTask(task.taskId, user.username)
      })

      randomSleep(1, 2)
    }

    console.log(`[VU${__VU}][cycle ${cycle}] batch done — looping back to tasks/latest`)
    // Loop continues — tasks/latest called automatically on next cycle
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL FLOW (Invoker OFF)
// Dashboard every cycle → tasks/v2 UNDIAGNOSED → manual assign → diagnose
// ─────────────────────────────────────────────────────────────────────────────
function manualFlow(h, BASE_URL, user) {
  const MAX_CYCLES = 5

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {

    // ── Dashboard ─────────────────────────────────────────────
    group('Dashboard', () => {
      const start = Date.now()
      http.batch([
        ['GET', `${BASE_URL}/api/v2/config`,               null, { headers: h, tags: { name: 'config' } }],
        ['GET', `${BASE_URL}/api/v2/language`,              null, { headers: h, tags: { name: 'language' } }],
        ['GET', `${BASE_URL}/api/v2/user`,                  null, { headers: h, tags: { name: 'user' } }],
        ['GET', `${BASE_URL}/api/v2/getQueueLength`,        null, { headers: h, tags: { name: 'getQueueLength' } }],
        ['GET', `${BASE_URL}/api/v2/report/doctor/active`,  null, { headers: h, tags: { name: 'report/doctor/active' } }],
        ['GET', `${BASE_URL}/api/v2/report/total/eta`,      null, { headers: h, tags: { name: 'report/total/eta' } }],
      ])
      dashboardLoadDuration.add(Date.now() - start)
    })

    http.post(`${BASE_URL}/api/v2/updateActive`,
      JSON.stringify({ isActive: 1, captureEvent: false }),
      { headers: h, tags: { name: 'updateActive' } })

    // ── Fetch 1 undiagnosed case and manually assign ──────────
    let task = null
    group('Fetch & Assign', () => {
      const undiagRes = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: 1, stage: 'UNDIAGNOSED', taskTypes: 'RESTING' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers: h, tags: { name: 'tasks/v2-undiagnosed' } })
      try {
        const body  = undiagRes.json()
        const tasks = (body.tasks || body || []).filter(t => t && t.taskId && t.taskId !== 'undefined')
        if (tasks.length > 0) task = tasks[0]
      } catch (_) {}

      if (task && !task.assignedAt) {
        const usersRes = http.get(
          `${BASE_URL}/api/v2/task/${task.taskId}/users?role=undefined`,
          { headers: h, tags: { name: 'task/users' } }
        )
        let assignable = []
        try { assignable = usersRes.json().users || [] } catch (_) {}
        const me = assignable.find(u => u.username.toLowerCase() === user.username.toLowerCase())

        // ── One-time isPreferred detection ──────────────────
        if (me && user.isPreferred === undefined) {
          user.isPreferred = me.isPreferred
          console.log(`[VU${__VU}] ${user.username} isPreferred: ${user.isPreferred}`)
        }

        if (INVOKER_ENABLED && user.isPreferred === true) {
          // Just detected as preferred — skip this task, Invoker path next cycle
          console.log(`[VU${__VU}] Preferred detected — switching to Invoker path next cycle`)
          task = null
        } else if (me) {
          http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({
            assignments: [{ username: me.username, taskId: task.taskId, role: 'DOCTOR' }],
          }), { headers: h, tags: { name: 'task/assign' } })
        }
      }
    })

    if (!task) {
      console.log(`[VU${__VU}][cycle ${cycle}] no cases — stopping`)
      break
    }

    // ── Open → review → diagnose ──────────────────────────────
    group('Diagnose Case', () => {
      http.get(
        `${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt || ''}`,
        { headers: h, tags: { name: 'nextEcg' } }
      )

      const caseId    = task.caseId || task.taskId
      const openStart = Date.now()
      http.batch([
        ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`,             null, { headers: h, tags: { name: 'ecgData' } }],
        ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`,             null, { headers: h, tags: { name: 'patient' } }],
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`,           null, { headers: h, tags: { name: 'tasks/algo' } }],
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`,  null, { headers: h, tags: { name: 'tasks/history/count' } }],
        ['GET', `${BASE_URL}/api/v2/case/${caseId}/comments/history`,     null, { headers: h, tags: { name: 'case/comments/history' } }],
      ])
      caseOpenDuration.add(Date.now() - openStart)

      const reviewStart = Date.now()
      openWebSocket(h['token'], 5, 'ecg_review')
      diagnosisReviewDuration.add(Date.now() - reviewStart)

      diagnoseTask(task.taskId, user.username)
    })

    randomSleep(1, 2)
  }
}

export function setup() {
  console.log(`Continuous diagnosis | ${VU_COUNT} VUs | Invoker: ${INVOKER_ENABLED ? 'ON' : 'OFF'}`)
}

export function teardown() {
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('Continuous diagnosis complete')
}
