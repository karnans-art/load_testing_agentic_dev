// CDS — Soak Test (Endurance)
// 20 VUs for 2 hours — catches memory leaks, connection pool exhaustion, degradation.
// Run: npm run soak:cds

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow, randomSleep, logoutAllDoctors } from './lib/cds-workflow.js'
import { simulatorPush } from './lib/cds-simulator.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',
      duration:        '2h',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simPush',
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

export function simPush() { simulatorPush() }

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
  logoutAllDoctors(USERS, Math.min(VU_COUNT, 20))
  console.log('Soak test complete')
}
