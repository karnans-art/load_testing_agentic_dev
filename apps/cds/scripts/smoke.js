// CDS — Smoke Test
// VUs = number of users in users.json (max 10) — 1 VU per user, no session conflicts
// Run: k6 run apps/cds/scripts/smoke.js

import { sleep } from 'k6'
import { authHeaders, isLoggedIn } from './lib/cds-auth.js'
import { doctorWorkflow } from './lib/cds-workflow.js'

const USERS = JSON.parse(open('../users.json')).users
const VU_COUNT = Math.min(USERS.length, 10)

export const options = {
  vus: VU_COUNT,
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
