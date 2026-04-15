// CDS — Continuous Diagnosis Flow
// Power user: doctor processes undiagnosed cases in a loop.
// Flow: dashboard → nextEcg → open case → review 30-45s → POST /diagnose → repeat
//
// NOTE: POST /api/v2/diagnose payload is a PLACEHOLDER — needs real curl from DevTools.
//       The rest of the flow is fully functional.
//
// Run: npm run diagnosis:cds

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { authHeaders, isLoggedIn, getUser, getBaseUrl } from './lib/cds-auth.js'
import { openWebSocket } from './lib/cds-websocket.js'
import { randomSleep } from './lib/cds-workflow.js'
import {
  dashboardLoadDuration, caseOpenDuration, diagnosisReviewDuration,
  diagnosisSubmitDuration, casesProcessedCount, apiSuccessRate, apiErrorCount,
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

export function diagnosisLoop() {
  let h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return

  // ── Dashboard Load ─────────────────────────────────────────
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

  // Mark doctor active
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: h, tags: { name: 'updateActive' } })

  // ── Fetch next undiagnosed case ────────────────────────────
  group('Fetch Case', () => {
    const nextRes = http.get(`${BASE_URL}/api/v2/nextEcg`, { headers: h, tags: { name: 'nextEcg-undiagnosed' } })
    const nextOk = check(nextRes, { 'nextEcg ok': (r) => r.status === 200 })
    apiSuccessRate.add(nextOk ? 1 : 0)

    if (!nextOk || nextRes.status !== 200) return

    let task = null
    try { task = nextRes.json() } catch (_) {}
    if (!task || !task.taskId) return

    // ── Open Case ────────────────────────────────────────────
    const openStart = Date.now()
    http.batch([
      ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers: h, tags: { name: 'ecgData' } }],
      ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers: h, tags: { name: 'patient' } }],
      ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, null, { headers: h, tags: { name: 'tasks/algo' } }],
      ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, null, { headers: h, tags: { name: 'tasks/history/count' } }],
      ['GET', `${BASE_URL}/api/v2/case/${task.caseId || task.taskId}/comments/history`, null, { headers: h, tags: { name: 'case/comments/history' } }],
    ])
    caseOpenDuration.add(Date.now() - openStart)

    // ── Review (30-45s WebSocket + think time) ───────────────
    const reviewStart = Date.now()
    const reviewSec = 30 + Math.floor(Math.random() * 15)
    openWebSocket(h.token, reviewSec, 'ecg_review')
    diagnosisReviewDuration.add(Date.now() - reviewStart)

    // ── Submit Diagnosis (PLACEHOLDER) ───────────────────────
    // TODO: Replace with real POST /api/v2/diagnose curl payload
    // The real payload needs: taskId, diagnosis codes, comments, form data
    // Capture it from DevTools when submitting a real diagnosis
    //
    // const diagStart = Date.now()
    // const diagRes = http.post(`${BASE_URL}/api/v2/diagnose`, diagPayload, { headers: h, tags: { name: 'diagnose' } })
    // check(diagRes, { 'diagnose ok': (r) => r.status >= 200 && r.status < 300 })
    // diagnosisSubmitDuration.add(Date.now() - diagStart)

    casesProcessedCount.add(1)
  })

  randomSleep(1, 3)
}

export function setup() {
  console.log(`Starting continuous diagnosis — ${VU_COUNT} doctor VUs`)
}

export function teardown() {
  console.log('Continuous diagnosis complete')
}
