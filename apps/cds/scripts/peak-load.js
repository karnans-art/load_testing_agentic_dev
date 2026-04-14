// CDS — Peak Load Test (3x Production)
// Simulates peak traffic: 3x normal rate
// Includes simulator pushing cases + doctor workflows
// Run: k6 run apps/cds/scripts/peak-load.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

const USERS = JSON.parse(open('../users.json')).users
const PEAK_MULTIPLIER = parseInt(__ENV.PEAK_MULTIPLIER || '3')

const ADMIN_URL = __ENV.SIMULATOR_ADMIN_URL || 'https://uat-admin.tricogdev.net'
const ADMIN_COOKIE = __ENV.TRICOG_ADMIN_COOKIE || ''
const CSI_FILE = open('../fixtures/sample.csi', 'b')

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6 * PEAK_MULTIPLIER,
      timeUnit:        '1m',
      duration:        '10m',
      preAllocatedVUs: 1,
      maxVUs:          4,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:        'constant-arrival-rate',
      rate:            6 * PEAK_MULTIPLIER,
      timeUnit:        '1m',
      duration:        '10m',
      preAllocatedVUs: USERS.length,
      maxVUs:          USERS.length,
      exec:            'doctorFlow',
      startTime:       '2s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
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
  console.log(`Starting peak load test — ${PEAK_MULTIPLIER}x production rate`)
}

export function teardown() {
  console.log('Peak load test complete')
}
