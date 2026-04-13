// CDS — Smoke Test
// VUs = number of users in users.json (max 10) — 1 VU per user, no session conflicts
// Run: k6 run apps/cds/scripts/smoke.js

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { authHeaders, isLoggedIn, getUser, getBaseUrl } from './lib/cds-auth.js'

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

export function setup() {
  console.log(`Starting smoke test with ${VU_COUNT} VUs`)
}

export default function () {
  const h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const BASE_URL = getBaseUrl()
  const user = getUser()

  // ── List Page ──────────────────────────────────────────────
  let tasks = []
  group('List Page', () => {
    const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/latest' } })

    http.post(`${BASE_URL}/api/v2/tasks/count`, '{}', { headers: h, tags: { name: 'tasks/count' } })
    http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, taskTypes: 'RESTING', view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2' } })

    http.get(`${BASE_URL}/api/v2/user`,                    { headers: h, tags: { name: 'user' } })
    http.get(`${BASE_URL}/api/v2/config`,                  { headers: h, tags: { name: 'config' } })
    http.get(`${BASE_URL}/api/v2/config/version/viewer`,   { headers: h, tags: { name: 'config/version/viewer' } })
    http.get(`${BASE_URL}/api/v2/language`,                { headers: h, tags: { name: 'language' } })
    http.get(`${BASE_URL}/api/v2/report/total/eta`,        { headers: h, tags: { name: 'report/total/eta' } })
    http.get(`${BASE_URL}/api/v2/report/doctor/active`,    { headers: h, tags: { name: 'report/doctor/active' } })
    http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}', { headers: h, tags: { name: 'report/doctor/avg' } })
    http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}',   { headers: h, tags: { name: 'report/day/avg' } })
    http.get(`${BASE_URL}/api/v2/getQueueLength`,          { headers: h, tags: { name: 'getQueueLength' } })

    // Parse tasks for diagnosis loop
    try {
      const body = tasksRes.json()
      tasks = body.tasks || body
      if (!Array.isArray(tasks)) tasks = []
    } catch (_) {}
  })

  // ── Diagnosis Page — loop through each task ───────────────
  for (const task of tasks) {
    group('Diagnosis Page', () => {
      http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers: h, tags: { name: 'nextEcg' } })
      http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/algo`,          { headers: h, tags: { name: 'tasks/algo' } })
      http.get(`${BASE_URL}/api/v2/ecgData/${task.taskId}`,             { headers: h, tags: { name: 'ecgData' } })
      http.get(`${BASE_URL}/api/v2/patient/${task.taskId}/`,            { headers: h, tags: { name: 'patient' } })
      http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, { headers: h, tags: { name: 'tasks/history/count' } })
      http.get(`${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, { headers: h, tags: { name: 'case/comments/history' } })
    })
  }

  sleep(1)
}

export function teardown() {
  console.log('Smoke test complete')
}
