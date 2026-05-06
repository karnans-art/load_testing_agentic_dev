// CDS — Admin Panel Simulator Push (standalone)
// Continuously pushes ECG cases through the Tricog admin panel simulator.
// No doctor login required — targets only the simulator endpoint.
//
// Run:  npm run simulator:cds
// Env:
//   TRICOG_ADMIN_COOKIE  (required) — session cookie from admin panel login
//   SIMULATOR_ADMIN_URL  (optional) — default: https://dev-new-admin.tricogdev.net
//   SIMULATOR_VUS        (optional) — number of concurrent pushers, default: 50
//   PUSH_INTERVAL        (optional) — seconds to sleep between pushes per VU, default: 2
//   DURATION             (optional) — how long to run, default: 5m

import { sleep } from 'k6'
import { simulatorPush } from './lib/cds-simulator.js'

const VUS           = parseInt(__ENV.SIMULATOR_VUS  || '2')
const PUSH_INTERVAL = parseFloat(__ENV.PUSH_INTERVAL || '120')
const DURATION      = __ENV.DURATION || '5m'

export const options = {
  scenarios: {
    simulator: {
      executor: 'constant-vus',
      vus:      VUS,
      duration: DURATION,
      exec:     'simPush',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
    checks:            ['rate>0.95'],
  },
}

export function setup() {
  console.log(`Admin panel simulator: ${VUS} VUs × ${PUSH_INTERVAL}s interval for ${DURATION}`)
  if (!__ENV.TRICOG_ADMIN_COOKIE) {
    console.warn('WARNING: TRICOG_ADMIN_COOKIE is not set — simulator pushes will likely fail (401/403)')
  }
}

export function simPush() {
  simulatorPush()
  sleep(PUSH_INTERVAL)
}
