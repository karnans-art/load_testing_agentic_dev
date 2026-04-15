// CDS — Stress Test
// Ramps from 1x → 5x production rate to find breaking point
// Includes simulator pushing cases + doctor workflows
// Run: k6 run apps/cds/scripts/stress-test.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

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
      duration:        '30m',
      preAllocatedVUs: 1,
      maxVUs:          4,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:          'ramping-arrival-rate',
      startRate:         6,
      timeUnit:          '1m',
      preAllocatedVUs:   VU_COUNT,
      maxVUs:            VU_COUNT,
      stages: [
        { duration: '5m', target: 6 },    // 1x — baseline
        { duration: '5m', target: 12 },   // 2x
        { duration: '5m', target: 18 },   // 3x — peak
        { duration: '5m', target: 24 },   // 4x
        { duration: '5m', target: 30 },   // 5x — breaking point?
        { duration: '5m', target: 0 },    // recovery
      ],
      exec:              'doctorFlow',
      startTime:         '2s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.20'],
    http_req_duration: ['p(95)<10000'],
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
  console.log('Starting stress test — ramping 1x → 5x production rate')
}

export function teardown() {
  console.log('Stress test complete')
}
