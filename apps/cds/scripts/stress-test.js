// CDS — Stress Test
// Ramps from 1x → 5x production rates to find breaking point
// Run: k6 run apps/cds/scripts/stress-test.js

import http from 'k6/http'
import { check } from 'k6'

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://uat-cds.tricogdev.net'
const TEST_EMAIL = __ENV.TEST_EMAIL || ''
const TEST_PASSWORD = __ENV.TEST_PASSWORD || ''

const AUTH_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json;charset=UTF-8',
  'appname': 'CDS',
  'lang': 'en',
}

// ── Options — ramping arrival rate ────────────────────────────
// Rates populated by runner/generate.js using WAF data
// Each stage multiplies base production rate
export const options = {
  scenarios: {
    stress_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 200,
      stages: [
        // Populated by generator — example shape:
        // { duration: '5m', target: 14 },   // 1x
        // { duration: '5m', target: 28 },   // 2x
        // { duration: '5m', target: 42 },   // 3x
        // { duration: '5m', target: 56 },   // 4x
        // { duration: '5m', target: 70 },   // 5x — find breaking point
        // { duration: '5m', target: 0 },    // recovery
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.20'],
    http_req_duration: ['p(95)<10000'],
  },
}

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ username: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: AUTH_HEADERS }
  )
  check(res, { '[cds] login ok': (r) => r.status === 200 })
  return { token: res.json('token') }
}
