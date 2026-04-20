// CDS — Peak Load Test (3x Production)
// Includes simulator pushing unique ECG cases + doctor workflows
// Run: k6 run apps/cds/scripts/peak-load.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow, logoutAllDoctors } from './lib/cds-workflow.js'
import { simulatorPush } from './lib/cds-simulator.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length
const PEAK_MULTIPLIER = parseInt(__ENV.PEAK_MULTIPLIER || '3')

export const options = {
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6 * PEAK_MULTIPLIER,
      timeUnit:        '1m',
      duration:        '10m',
      preAllocatedVUs: 1,
      maxVUs:          4,
      exec:            'simPush',
    },
    doctors: {
      executor:        'constant-arrival-rate',
      rate:            6 * PEAK_MULTIPLIER,
      timeUnit:        '1m',
      duration:        '10m',
      preAllocatedVUs: VU_COUNT,
      maxVUs:          VU_COUNT,
      exec:            'doctorFlow',
      startTime:       '2s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
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
  console.log(`Starting peak load test — ${PEAK_MULTIPLIER}x production rate`)
}

export function teardown() {
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('Peak load test complete')
}
