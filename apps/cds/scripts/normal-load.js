// CDS — Normal Load Test (Production Replay)
// Simulates production traffic rate: ~6 doctor workflows/min
// WAF: ~103 doctor-endpoint hits/min ÷ 19 calls/workflow ≈ 5.4 → 6 workflows/min
// Each iteration = 1 full doctor workflow (19 API calls) → ~114 HTTP req/min
// Run: k6 run apps/cds/scripts/normal-load.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

export const options = {
  scenarios: {
    doctor_workflow: {
      executor: 'constant-arrival-rate',
      rate: 6,                     // 6 workflows/min (matches production rate)
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 3,
      maxVUs: 10,
      tags: { app: 'cds', scenario: 'normal' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
  },
}

export default function () {
  authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
}
