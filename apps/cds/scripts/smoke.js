// CDS — Smoke Test
// 1 VU, 30s — verify all endpoints work before load testing
// Run: k6 run apps/cds/scripts/smoke.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
}

export default function () {
  authHeaders()  // ensure logged in (once per VU)
  if (!isLoggedIn()) { sleep(1); return }

  doctorWorkflow()
  sleep(1)
}
