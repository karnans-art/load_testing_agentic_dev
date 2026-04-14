// CDS — Smoke Test
// VUs = number of users in users.json — 1 VU per user, no session conflicts
// Includes simulator pushing cases + doctor workflow
// Run: k6 run apps/cds/scripts/smoke.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

const USERS = JSON.parse(open('../users.json')).users
const VU_COUNT = Math.min(USERS.length, 10)

const ADMIN_URL = __ENV.SIMULATOR_ADMIN_URL || 'https://uat-admin.tricogdev.net'
const ADMIN_COOKIE = __ENV.TRICOG_ADMIN_COOKIE || ''
const CSI_FILE = open('../fixtures/sample.csi', 'b')

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',
      duration:        '30s',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:    'per-vu-iterations',
      vus:         VU_COUNT,
      iterations:  100,
      maxDuration: '30s',
      exec:        'doctorFlow',
      startTime:   '2s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
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
    headers: {
      'cookie':          ADMIN_COOKIE,
      'x-custom-header': 'foobar',
    },
    tags: { name: 'simulator' },
  })

  const ok = check(res, { 'simulator push ok': (r) => r.status >= 200 && r.status < 300 })
  if (!ok) {
    console.error(`Simulator push failed: ${res.status} — ${res.body?.slice(0, 200)}`)
  }
}

export function doctorFlow() {
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
  sleep(1)
}

export function setup() {
  console.log(`Starting smoke test — ${VU_COUNT} doctor VUs + simulator`)
}

export function teardown() {
  console.log('Smoke test complete')
}
