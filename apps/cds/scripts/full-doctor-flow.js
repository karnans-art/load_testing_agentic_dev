// CDS — Full Doctor Flow (Probabilistic Routing)
// Mixed API + WebSocket — simulates realistic doctor behavior:
//   40% Dashboard review (browse + 5s WebSocket)
//   30% ECG case review (open case + 30-60s WebSocket)
//   15% Filter/search cases
//   15% Multi-case review (rapid cycling)
// Run: npm run full-flow:cds

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { authHeaders, isLoggedIn, getUser, getBaseUrl } from './lib/cds-auth.js'
import { openWebSocket } from './lib/cds-websocket.js'
import { randomSleep } from './lib/cds-workflow.js'
import {
  dashboardLoadDuration, taskListDuration, ecgViewerLoadDuration,
  taskFilterDuration, apiSuccessRate, apiErrorCount,
} from './lib/cds-metrics.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length

const ADMIN_URL = __ENV.SIMULATOR_ADMIN_URL || 'https://uat-admin.tricogdev.net'
const ADMIN_COOKIE = __ENV.TRICOG_ADMIN_COOKIE || ''
const CSI_FILE = open('../fixtures/sample.csi', 'b')

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',
      duration:        '5m',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:    'ramping-vus',
      startVUs:    0,
      stages: [
        { duration: '1m', target: VU_COUNT },
        { duration: '3m', target: VU_COUNT },
        { duration: '1m', target: 0 },
      ],
      exec: 'doctorFlow',
      startTime: '2s',
    },
  },
  thresholds: {
    http_req_failed:              ['rate<0.10'],
    http_req_duration:            ['p(95)<5000'],
    cds_dashboard_load_duration:  ['p(95)<3000'],
    cds_ecg_viewer_load_duration: ['p(95)<5000'],
    checks:                       ['rate>0.90'],
  },
}

export function simulatorPush() {
  const res = http.post(`${ADMIN_URL}/api/case/simulator`, {
    centerId:  '3520',
    caseType:  'RESTING',
    clientUrl: 'http://cloud-server/simulate',
    deviceId:  'HE-BE68A686',
    file:      http.file(CSI_FILE, 'sample.csi', 'application/octet-stream'),
  }, {
    headers: { 'cookie': ADMIN_COOKIE, 'x-custom-header': 'foobar' },
    tags: { name: 'simulator' },
  })
  check(res, { 'simulator push ok': (r) => r.status >= 200 && r.status < 300 })
}

export function doctorFlow() {
  const h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return

  // Pick scenario based on probability
  const roll = Math.random()
  if (roll < 0.40)       dashboardReview(BASE_URL, h, user)
  else if (roll < 0.70)  ecgCaseReview(BASE_URL, h, user)
  else if (roll < 0.85)  filterSearch(BASE_URL, h, user)
  else                    multiCaseReview(BASE_URL, h, user)
}

// ── 40% Dashboard Review ─────────────────────────────────────
function dashboardReview(BASE_URL, h, user) {
  group('Dashboard Review', () => {
    const start = Date.now()

    const shiftPayload = JSON.stringify({
      startTime: new Date(new Date().setHours(0,0,0,0)).toISOString(),
      endTime: new Date(new Date().setHours(23,59,59,999)).toISOString(),
    })

    http.batch([
      ['GET', `${BASE_URL}/api/v2/config`, null, { headers: h, tags: { name: 'config' } }],
      ['GET', `${BASE_URL}/api/v2/language`, null, { headers: h, tags: { name: 'language' } }],
      ['GET', `${BASE_URL}/api/v2/config/version/viewer`, null, { headers: h, tags: { name: 'config/version/viewer' } }],
      ['GET', `${BASE_URL}/api/v2/user`, null, { headers: h, tags: { name: 'user' } }],
      ['GET', `${BASE_URL}/api/v2/getQueueLength`, null, { headers: h, tags: { name: 'getQueueLength' } }],
      ['GET', `${BASE_URL}/api/v2/report/doctor/active`, null, { headers: h, tags: { name: 'report/doctor/active' } }],
      ['GET', `${BASE_URL}/api/v2/report/total/eta`, null, { headers: h, tags: { name: 'report/total/eta' } }],
      ['POST', `${BASE_URL}/api/v2/report/doctor/avg`, shiftPayload, { headers: h, tags: { name: 'report/doctor/avg' } }],
      ['POST', `${BASE_URL}/api/v2/report/day/avg`, shiftPayload, { headers: h, tags: { name: 'report/day/avg' } }],
    ])

    dashboardLoadDuration.add(Date.now() - start)

    // 5s WebSocket session (viewing dashboard)
    openWebSocket(h.token, 5, 'dashboard_review')
  })

  randomSleep(2, 5)
}

// ── 30% ECG Case Review ──────────────────────────────────────
function ecgCaseReview(BASE_URL, h, user) {
  group('ECG Case Review', () => {
    // Get task list
    const listStart = Date.now()
    const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/latest' } })
    taskListDuration.add(Date.now() - listStart)

    let task = null
    try {
      const body = tasksRes.json()
      const tasks = body.tasks || body
      if (Array.isArray(tasks) && tasks.length > 0) task = tasks[0]
    } catch (_) {}

    if (!task) return

    // Open case — batch viewer calls
    const viewerStart = Date.now()
    http.batch([
      ['GET', `${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, null, { headers: h, tags: { name: 'nextEcg' } }],
      ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, null, { headers: h, tags: { name: 'tasks/algo' } }],
      ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers: h, tags: { name: 'ecgData' } }],
      ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers: h, tags: { name: 'patient' } }],
      ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, null, { headers: h, tags: { name: 'tasks/history/count' } }],
      ['GET', `${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, null, { headers: h, tags: { name: 'case/comments/history' } }],
    ])
    ecgViewerLoadDuration.add(Date.now() - viewerStart)

    // 30-60s WebSocket session (reviewing ECG)
    const reviewSec = 30 + Math.floor(Math.random() * 30)
    openWebSocket(h.token, reviewSec, 'ecg_review')
  })

  randomSleep(1, 3)
}

// ── 15% Filter/Search ────────────────────────────────────────
function filterSearch(BASE_URL, h, user) {
  group('Filter Search', () => {
    const start = Date.now()

    // All cases
    http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2' } })

    randomSleep(1, 2)

    // Filter by task type
    http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: 'ASSIGNED_DIAGNOSED', view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2-filtered' } })

    // Pagination — page 2
    http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 2, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2-page2' } })

    taskFilterDuration.add(Date.now() - start)
  })

  randomSleep(2, 4)
}

// ── 15% Multi-Case Review (rapid cycling) ────────────────────
function multiCaseReview(BASE_URL, h, user) {
  group('Multi-Case Review', () => {
    const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/latest' } })

    let tasks = []
    try {
      const body = tasksRes.json()
      tasks = body.tasks || body
      if (!Array.isArray(tasks)) tasks = []
    } catch (_) {}

    // Cycle through up to 3 cases quickly
    const casesToReview = tasks.slice(0, 3)
    for (const task of casesToReview) {
      const viewerStart = Date.now()
      http.batch([
        ['GET', `${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, null, { headers: h, tags: { name: 'nextEcg' } }],
        ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers: h, tags: { name: 'ecgData' } }],
        ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers: h, tags: { name: 'patient' } }],
      ])
      ecgViewerLoadDuration.add(Date.now() - viewerStart)
      randomSleep(1, 3)
    }
  })
}

export function setup() {
  console.log(`Starting full doctor flow — probabilistic routing`)
}

export function teardown() {
  console.log('Full doctor flow complete')
}
