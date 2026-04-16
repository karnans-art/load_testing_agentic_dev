// CDS — Stress Test
// Ramps dynamically based on available users to find breaking point.
// Rates scale with VU_COUNT: 1x warmup → 5x → 10x → 50% capacity → max capacity → recovery
// More users in users.json = higher stress ceiling.
// Run: k6 run apps/cds/scripts/stress-test.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length

const BASE_RATE = 6  // 1x production rate (workflows/min from WAF)

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
      startRate:         BASE_RATE,
      timeUnit:          '1m',
      preAllocatedVUs:   VU_COUNT,
      maxVUs:            VU_COUNT,
      stages: [
        { duration: '5m', target: BASE_RATE },                              // 1x — warmup
        { duration: '5m', target: BASE_RATE * 5 },                          // 5x
        { duration: '5m', target: Math.min(BASE_RATE * 10, VU_COUNT) },     // 10x or max users
        { duration: '5m', target: Math.min(Math.floor(VU_COUNT / 2), VU_COUNT) },  // 50% capacity
        { duration: '5m', target: VU_COUNT },                               // max capacity
        { duration: '5m', target: 0 },                                      // recovery
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
  console.log(`Starting stress test — ${VU_COUNT} max VUs, ramping ${BASE_RATE} → ${VU_COUNT} workflows/min`)
}

export function teardown() {
  console.log('Stress test complete')
}
