// CDS — Smoke Test
// Flow: Login → updateActive (once per VU) → test critical endpoints
// Auth: one login per VU at startup; auto-refresh on 401
// Scaling: add more users to apps/cds/users.json — each VU picks by index
// Run: k6 run apps/cds/scripts/smoke.js

import http from 'k6/http'
import { check, sleep } from 'k6'

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net'

// Load users from JSON — each VU gets its own user by round-robin index
// To scale: add more objects to apps/cds/users.json
const USERS = JSON.parse(open('../users.json')).users

const HEADERS = {
  'Accept':           'application/json, text/plain, */*',
  'Accept-Language':  'en-GB,en-US;q=0.9,en;q=0.8',
  'Content-Type':     'application/json',
  'clientdevicetype': 'Linux x86_64',
  'clientos':         'INSTA_ECG_VIEWER',
  'clientosversion':  '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'clientversion':    '0.14.4',
  'user-agent':       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'token':            '',
}

// ── Options ────────────────────────────────────────────────────
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
}

// ── VU-local state (one per VU, not shared) ────────────────────
// Each VU logs in once. On 401, transparently re-logs in.
let _token = null
let _vuUser = null

function getUser() {
  if (!_vuUser) {
    // __VU is 1-indexed; round-robin across available users
    _vuUser = USERS[(__VU - 1) % USERS.length]
  }
  return _vuUser
}

function doLogin() {
  const user = getUser()
  const loginRes = http.post(
    `${BASE_URL}/api/v2/login`,
    JSON.stringify({
      domainId:    user.domainId,
      username:    user.username,
      password:    user.password,
      application: 'INSTA_ECG_VIEWER',
      appVersion:  '3.0.0',
    }),
    { headers: HEADERS }
  )
  check(loginRes, { 'login ok': (r) => r.status === 200 })
  const token = loginRes.json('token')
  if (!token) {
    console.error(`[VU${__VU}] Login failed: ${loginRes.status} — ${loginRes.body?.slice(0, 200)}`)
    return null
  }

  const authedHeaders = { ...HEADERS, 'token': token }

  // updateActive — mark doctor online (required before tasks/latest)
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: authedHeaders }
  )

  // Fetch live doctor profile — use response fields to build payloads (no hardcoding)
  const profileRes = http.get(`${BASE_URL}/api/v2/user`, { headers: authedHeaders })
  const profile = profileRes.json()
  const doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || user.username

  _vuUser.doctorName = doctorName
  _token = token
  console.log(`[VU${__VU}] Logged in — doctor: ${doctorName} token: ${token.slice(0, 8)}…`)
  return token
}

// Returns authed headers; logs in once per VU, refreshes on demand
function authHeaders(forceRefresh = false) {
  if (!_token || forceRefresh) {
    doLogin()
  }
  return { ...HEADERS, 'token': _token }
}

// ── Test ───────────────────────────────────────────────────────
export default function () {
  let headers = authHeaders()
  if (!_token) { sleep(1); return }

  // ── tasks/latest — requires doctor to be active ──────────────
  let tasksRes = http.post(
    `${BASE_URL}/api/v2/tasks/latest`,
    JSON.stringify({
      filter: {
        doctorName: getUser().doctorName,  // from live GET /user response
        pageNo:     1,
        perPage:    25,
        stage:      'ASSIGNED_DIAGNOSED',
        taskTypes:  'RESTING',
      },
      sortBy: {
        datetime:   { enable: false },
        timeread:   { enable: true, order: 'DESC' },
        assignedAt: { enable: true, order: 'DESC' },
      },
    }),
    { headers }
  )
  // Auto-refresh token if session expired
  if (tasksRes.status === 401) {
    headers = authHeaders(true)
    tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`,
      JSON.stringify({ filter: { doctorName: getUser().doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' }, sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } } }),
      { headers })
  }
  check(tasksRes, { 'tasks/latest 2xx': (r) => r.status >= 200 && r.status < 300 })
  if (tasksRes.status >= 400) {
    console.log(`  ✗ tasks/latest → ${tasksRes.status} | ${tasksRes.body?.slice(0, 120)}`)
  }

  // ── Other critical endpoints ─────────────────────────────────
  const tests = [
    { name: 'tasks/count',
      fn: () => http.post(`${BASE_URL}/api/v2/tasks/count`, '{}', { headers }) },

    { name: 'tasks/v2',
      fn: () => http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '',
                  taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers }) },

    { name: 'user',
      fn: () => http.get(`${BASE_URL}/api/v2/user`, { headers }) },

    { name: 'config',
      fn: () => http.get(`${BASE_URL}/api/v2/config`, { headers }) },

    { name: 'language',
      fn: () => http.get(`${BASE_URL}/api/v2/language`, { headers }) },

    // doctor-stat: ⏳ PENDING — correct payload needed (share curl from DevTools)
    // { name: 'doctor-stat', fn: () => http.post(`${BASE_URL}/api/v2/doctor-stat/`, JSON.stringify({...}), { headers }) },

    { name: 'report/total/eta',
      fn: () => http.get(`${BASE_URL}/api/v2/report/total/eta`, { headers }) },

    { name: 'report/doctor/active',
      fn: () => http.get(`${BASE_URL}/api/v2/report/doctor/active`, { headers }) },
  ]

  tests.forEach(({ name, fn }) => {
    const res = fn()
    // Auto-refresh on 401 and retry once
    if (res.status === 401) {
      headers = authHeaders(true)
      if (!_token) return
    }
    const ok = check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 })
    if (!ok) console.log(`  ✗ ${name} → ${res.status} | ${res.body?.slice(0, 100)}`)
  })

  sleep(1)
}
