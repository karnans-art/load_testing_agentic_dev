// CDS — Soak Test (Endurance)
// 20 VUs for 2 hours — catches memory leaks, connection pool exhaustion, degradation.
// Includes simulator pushing cases + doctor workflows.
// Run: npm run soak:cds

import http from 'k6/http'
import { check, sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow, randomSleep } from './lib/cds-workflow.js'

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
      duration:        '2h',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:    'constant-vus',
      vus:         Math.min(VU_COUNT, 20),
      duration:    '2h',
      exec:        'doctorFlow',
      startTime:   '2s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    checks:            ['rate>0.95'],
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
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
  randomSleep(1, 3)
}

export function setup() {
  console.log(`Starting soak test — ${Math.min(VU_COUNT, 20)} VUs for 2 hours`)
}

export function teardown() {
  console.log('Soak test complete')
}
