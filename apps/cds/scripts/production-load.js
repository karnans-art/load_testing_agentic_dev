// CDS — Production Replication Load Test
// Sends traffic at EXACT WAF production rates (109 req/min total).
// Uses weighted random endpoint selection so each VU = 1 user session.
// This avoids session invalidation when multiple VUs share 1 user.
//
// VU count = number of users in users.json (1 user → 1 VU, 5 users → 5 VUs)
// Run: k6 run apps/cds/scripts/production-load.js

import http from 'k6/http'
import { check } from 'k6'

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net'
const USERS    = JSON.parse(open('../users.json')).users
const VU_COUNT = USERS.length

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

// ── Weighted endpoint table (weight = WAF hits/min) ────────────
const ENDPOINTS = [
  { name: 'tasks/latest',              weight: 35, needsTask: false },
  { name: 'nextEcg',                   weight: 16, needsTask: true  },
  { name: 'tasks/v2',                  weight: 6,  needsTask: false },
  { name: 'config/version/viewer',     weight: 5,  needsTask: false },
  { name: 'tasks/count',               weight: 5,  needsTask: false },
  { name: 'tasks/algo',                weight: 5,  needsTask: true  },
  { name: 'ecgData',                   weight: 5,  needsTask: true  },
  { name: 'patient',                   weight: 5,  needsTask: true  },
  { name: 'tasks/history/count',       weight: 5,  needsTask: true  },
  { name: 'case/comments/history',     weight: 5,  needsTask: true  },
  { name: 'user',                      weight: 4,  needsTask: false },
  { name: 'report/doctor/avg',         weight: 4,  needsTask: false },
  { name: 'config',                    weight: 3,  needsTask: false },
  { name: 'report/total/eta',          weight: 3,  needsTask: false },
  { name: 'report/doctor/active',      weight: 3,  needsTask: false },
  { name: 'report/day/avg',            weight: 2,  needsTask: false },
  { name: 'getQueueLength',            weight: 2,  needsTask: false },
  { name: 'task/users',                weight: 1,  needsTask: true  },
  { name: 'task/assign',               weight: 1,  needsTask: true  },
  { name: 'language',                  weight: 1,  needsTask: false },
]

const TOTAL_WEIGHT = ENDPOINTS.reduce((s, e) => s + e.weight, 0) // 109
let cumulative = 0
const WEIGHTED = ENDPOINTS.map(e => {
  cumulative += e.weight / TOTAL_WEIGHT
  return { ...e, threshold: cumulative }
})

function pickEndpoint() {
  const r = Math.random()
  return WEIGHTED.find(e => r <= e.threshold) || WEIGHTED[WEIGHTED.length - 1]
}

// ── Scenario ───────────────────────────────────────────────────
export const options = {
  scenarios: {
    production: {
      executor:        'constant-arrival-rate',
      rate:            TOTAL_WEIGHT,   // 109 req/min — exact production rate
      timeUnit:        '1m',
      duration:        '10m',
      preAllocatedVUs: VU_COUNT,
      maxVUs:          VU_COUNT,       // cap at user count — prevents session conflicts
      exec:            'productionIteration',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
  },
}

// ── VU-local auth ──────────────────────────────────────────────
let _token     = null
let _tokenTime = 0
let _vuUser    = null
let _taskId    = null
let _caseId    = null
let _assignedAt = null

const TOKEN_TTL = 20000  // proactively refresh before ~27s server expiry

function getUser() {
  if (!_vuUser) {
    const idx = __VU - 1
    if (idx >= USERS.length) return null  // no user for this VU — avoid session collision
    _vuUser = { ...USERS[idx] }
  }
  return _vuUser
}

function ensureAuth() {
  if (_token && (Date.now() - _tokenTime < TOKEN_TTL)) {
    return { ...HEADERS, 'token': _token }
  }

  const user = getUser()
  if (!user) return HEADERS  // no user for this VU

  // Login
  const loginRes = http.post(`${BASE_URL}/api/v2/login`,
    JSON.stringify({ domainId: user.domainId, username: user.username, password: user.password, application: 'INSTA_ECG_VIEWER', appVersion: '3.0.0' }),
    { headers: HEADERS, tags: { name: 'login' } })
  check(loginRes, { 'login ok': (r) => r.status === 200 })
  _token = loginRes.json('token')
  _tokenTime = Date.now()
  if (!_token) return HEADERS

  const authed = { ...HEADERS, 'token': _token }

  // Update active status
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: authed, tags: { name: 'updateActive' } })

  // Get doctor name from profile
  const profileRes = http.get(`${BASE_URL}/api/v2/user`, { headers: authed, tags: { name: 'profile' } })
  try {
    const profile = profileRes.json()
    _vuUser.doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || user.username
  } catch (_) {}

  // Fetch a task for task-dependent endpoints
  const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`,
    JSON.stringify({
      filter: { doctorName: _vuUser.doctorName, pageNo: 1, perPage: 5, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }),
    { headers: authed, tags: { name: 'setup-tasks' } })
  try {
    const body = tasksRes.json()
    const tasks = body.tasks || body
    if (Array.isArray(tasks) && tasks.length > 0) {
      _taskId    = tasks[0].taskId
      _caseId    = tasks[0].caseId
      _assignedAt = tasks[0].assignedAt
    }
  } catch (_) {}

  console.log(`[VU${__VU}] Auth refresh — doctor: ${_vuUser.doctorName}, task: ${_taskId || 'none'}`)
  return authed
}

// Transparent 401 retry
function withAuth(fn) {
  let headers = ensureAuth()
  const res = fn(headers)
  if (res && res.status === 401) {
    _token = null  // force re-login
    headers = ensureAuth()
    return fn(headers)
  }
  return res
}

// ── Main iteration — weighted random endpoint ──────────────────
export function productionIteration() {
  const ep = pickEndpoint()

  // Skip task-dependent endpoints if no task available
  if (ep.needsTask) {
    ensureAuth()
    if (!_taskId) return
  }

  const res = withAuth((h) => callEndpoint(ep.name, h))
  if (res) {
    check(res, { [`${ep.name} 2xx`]: (r) => r.status >= 200 && r.status < 300 })
  }
}

// ── Endpoint dispatcher ────────────────────────────────────────
function callEndpoint(name, h) {
  const user = getUser()

  switch (name) {
    case 'tasks/latest':
      return http.post(`${BASE_URL}/api/v2/tasks/latest`,
        JSON.stringify({
          filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
          sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
        }), { headers: h, tags: { name: 'tasks/latest' } })

    case 'nextEcg':
      return http.get(`${BASE_URL}/api/v2/nextEcg?id=${_taskId}&assignedAt=${_assignedAt}`,
        { headers: h, tags: { name: 'nextEcg' } })

    case 'tasks/v2':
      return http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers: h, tags: { name: 'tasks/v2' } })

    case 'config/version/viewer':
      return http.get(`${BASE_URL}/api/v2/config/version/viewer`,
        { headers: h, tags: { name: 'config/version/viewer' } })

    case 'tasks/count':
      return http.post(`${BASE_URL}/api/v2/tasks/count`, '{}',
        { headers: h, tags: { name: 'tasks/count' } })

    case 'tasks/algo':
      return http.get(`${BASE_URL}/api/v2/tasks/${_taskId}/algo`,
        { headers: h, tags: { name: 'tasks/algo' } })

    case 'ecgData':
      return http.get(`${BASE_URL}/api/v2/ecgData/${_taskId}`,
        { headers: h, tags: { name: 'ecgData' } })

    case 'patient':
      return http.get(`${BASE_URL}/api/v2/patient/${_taskId}/`,
        { headers: h, tags: { name: 'patient' } })

    case 'tasks/history/count':
      return http.get(`${BASE_URL}/api/v2/tasks/${_taskId}/history/count`,
        { headers: h, tags: { name: 'tasks/history/count' } })

    case 'case/comments/history':
      return http.get(`${BASE_URL}/api/v2/case/${_caseId}/comments/history`,
        { headers: h, tags: { name: 'case/comments/history' } })

    case 'user':
      return http.get(`${BASE_URL}/api/v2/user`,
        { headers: h, tags: { name: 'user' } })

    case 'report/doctor/avg':
      return http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}',
        { headers: h, tags: { name: 'report/doctor/avg' } })

    case 'config':
      return http.get(`${BASE_URL}/api/v2/config`,
        { headers: h, tags: { name: 'config' } })

    case 'report/total/eta':
      return http.get(`${BASE_URL}/api/v2/report/total/eta`,
        { headers: h, tags: { name: 'report/total/eta' } })

    case 'report/doctor/active':
      return http.get(`${BASE_URL}/api/v2/report/doctor/active`,
        { headers: h, tags: { name: 'report/doctor/active' } })

    case 'report/day/avg':
      return http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}',
        { headers: h, tags: { name: 'report/day/avg' } })

    case 'getQueueLength':
      return http.get(`${BASE_URL}/api/v2/getQueueLength`,
        { headers: h, tags: { name: 'getQueueLength' } })

    case 'task/users':
      return http.get(`${BASE_URL}/api/v2/task/${_taskId}/users?role=undefined`,
        { headers: h, tags: { name: 'task/users' } })

    case 'task/assign': {
      // Fetch assignable doctors first, use correct username
      const usersRes = http.get(`${BASE_URL}/api/v2/task/${_taskId}/users?role=undefined`, { headers: h, tags: { name: 'task/users' } })
      let assignable = []
      try { assignable = usersRes.json().users || [] } catch (_) {}
      const me = assignable.find(u => u.username.toLowerCase() === user.username.toLowerCase())
      if (!me) return usersRes
      return http.post(`${BASE_URL}/api/v2/task/assign`,
        JSON.stringify({ assignments: [{ username: me.username, taskId: _taskId, role: 'DOCTOR' }] }),
        { headers: h, tags: { name: 'task/assign' } })
    }

    case 'language':
      return http.get(`${BASE_URL}/api/v2/language`,
        { headers: h, tags: { name: 'language' } })
  }
}
