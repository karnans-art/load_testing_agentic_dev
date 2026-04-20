// CDS — Smoke Test
// VUs = number of users in users.json — 1 VU per user, no session conflicts
// Includes simulator pushing unique ECG cases + doctor workflow
// Run: k6 run apps/cds/scripts/smoke.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow, logoutAllDoctors } from './lib/cds-workflow.js'
import { simulatorPush } from './lib/cds-simulator.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : Math.min(USERS.length, 5)

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',
      duration:        '30s',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simPush',
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

export function simPush() {
  simulatorPush()
}

export function doctorFlow() {
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
  sleep(1)
}

export function setup() {
  console.log(`Starting smoke test — ${VU_COUNT} doctor VUs + simulator (34 unique ECGs)`)
}

export function teardown() {
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('Smoke test complete')
}
