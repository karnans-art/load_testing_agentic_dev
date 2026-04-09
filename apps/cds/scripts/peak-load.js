// CDS — Peak Load Test (3x Production)
// Simulates peak traffic: 3x normal rate = ~18 workflows/min
// 18 workflows × 19 calls = ~342 HTTP req/min
// Run: k6 run apps/cds/scripts/peak-load.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

const PEAK_MULTIPLIER = parseInt(__ENV.PEAK_MULTIPLIER || '3')

export const options = {
  scenarios: {
    doctor_workflow_peak: {
      executor: 'constant-arrival-rate',
      rate: 6 * PEAK_MULTIPLIER,   // 18 workflows/min at 3x
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 8,
      maxVUs: 30,
      tags: { app: 'cds', scenario: 'peak' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
  },
}

export default function () {
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
}
