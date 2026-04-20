// CDS — Stress Test
// Ramps dynamically based on available users to find breaking point.
// Rates scale with VU_COUNT: 1x warmup → 5x → 10x → 50% capacity → max capacity → recovery
// Run: k6 run apps/cds/scripts/stress-test.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow, logoutAllDoctors } from './lib/cds-workflow.js'
import { simulatorPush } from './lib/cds-simulator.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length
const BASE_RATE = 6

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',
      duration:        '30m',
      preAllocatedVUs: 1,
      maxVUs:          4,
      exec:            'simPush',
    },
    doctors: {
      executor:          'ramping-arrival-rate',
      startRate:         BASE_RATE,
      timeUnit:          '1m',
      preAllocatedVUs:   VU_COUNT,
      maxVUs:            VU_COUNT,
      stages: [
        { duration: '5m', target: BASE_RATE },
        { duration: '5m', target: BASE_RATE * 5 },
        { duration: '5m', target: Math.min(BASE_RATE * 10, VU_COUNT) },
        { duration: '5m', target: Math.min(Math.floor(VU_COUNT / 2), VU_COUNT) },
        { duration: '5m', target: VU_COUNT },
        { duration: '5m', target: 0 },
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

export function simPush() { simulatorPush() }

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
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('Stress test complete')
}
