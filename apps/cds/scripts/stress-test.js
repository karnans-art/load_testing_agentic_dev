// CDS — Stress Test
// Ramps from 1x → 5x production rate to find breaking point
// 1x = 6 workflows/min (114 req/min), 5x = 30 workflows/min (570 req/min)
// Run: k6 run apps/cds/scripts/stress-test.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

export const options = {
  scenarios: {
    stress_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 6,                // 1x production
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 200,
      stages: [
        { duration: '5m', target: 6 },    // 1x — baseline
        { duration: '5m', target: 12 },   // 2x
        { duration: '5m', target: 18 },   // 3x — peak
        { duration: '5m', target: 24 },   // 4x
        { duration: '5m', target: 30 },   // 5x — breaking point?
        { duration: '5m', target: 0 },    // recovery
      ],
      tags: { app: 'cds', scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.20'],     // relaxed — stress test is supposed to push limits
    http_req_duration: ['p(95)<10000'],
  },
}

export default function () {
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
}
