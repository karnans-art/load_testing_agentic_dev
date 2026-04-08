// CDS — Doctor Workflow
// Full doctor flow: tasks/latest → assign → per-task endpoints → standalone endpoints
// 19 API calls per iteration (1 + 1 + 7 + 10)
// All IDs derived from live API responses — zero hardcoding.

import http from 'k6/http'
import { check } from 'k6'
import { authHeaders, getUser, getBaseUrl } from './cds-auth.js'

/**
 * Run the complete doctor workflow for one iteration.
 * Returns early (with logs) if no tasks available.
 */
export function doctorWorkflow() {
  let headers = authHeaders()
  const BASE_URL = getBaseUrl()
  const user = getUser()

  // ── 1. tasks/latest — anchor call ────────────────────────────
  let tasksRes = http.post(
    `${BASE_URL}/api/v2/tasks/latest`,
    JSON.stringify({
      filter: {
        doctorName: user.doctorName,
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
  if (tasksRes.status === 401) {
    headers = authHeaders(true)
    tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`,
      JSON.stringify({ filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' }, sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } } }),
      { headers })
  }
  check(tasksRes, { 'tasks/latest 2xx': (r) => r.status >= 200 && r.status < 300 })

  // ── Extract task ─────────────────────────────────────────────
  let task = null
  try {
    const body = tasksRes.json()
    const tasks = body.tasks || body
    if (Array.isArray(tasks) && tasks.length > 0) {
      task = tasks[0]
    }
  } catch (_) {}

  // ── 2. Assign task ───────────────────────────────────────────
  if (task) {
    const assignRes = http.post(
      `${BASE_URL}/api/v2/task/assign`,
      JSON.stringify({
        assignments: [{
          username: user.doctorName,
          taskId:   task.taskId,
          role:     'DOCTOR',
        }],
      }),
      { headers }
    )
    check(assignRes, { 'task/assign 2xx': (r) => r.status >= 200 && r.status < 300 })
  }

  // ── 3. Per-task endpoints (chained) ──────────────────────────
  if (task) {
    const taskId     = task.taskId
    const caseId     = task.caseId
    const assignedAt = task.assignedAt

    const taskTests = [
      { name: 'nextEcg',
        fn: () => http.get(`${BASE_URL}/api/v2/nextEcg?id=${taskId}&assignedAt=${assignedAt}`, { headers }) },
      { name: 'tasks/{id}/algo',
        fn: () => http.get(`${BASE_URL}/api/v2/tasks/${taskId}/algo`, { headers }) },
      { name: 'ecgData/{id}',
        fn: () => http.get(`${BASE_URL}/api/v2/ecgData/${taskId}`, { headers }) },
      { name: 'patient/{id}',
        fn: () => http.get(`${BASE_URL}/api/v2/patient/${taskId}/`, { headers }) },
      { name: 'tasks/{id}/history/count',
        fn: () => http.get(`${BASE_URL}/api/v2/tasks/${taskId}/history/count`, { headers }) },
      { name: 'case/{id}/comments/history',
        fn: () => http.get(`${BASE_URL}/api/v2/case/${caseId}/comments/history`, { headers }) },
      { name: 'config/version/viewer',
        fn: () => http.get(`${BASE_URL}/api/v2/config/version/viewer`, { headers }) },
    ]

    taskTests.forEach(({ name, fn }) => {
      const res = fn()
      if (res.status === 401) { headers = authHeaders(true) }
      const ok = check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 })
      if (!ok) console.log(`  ✗ ${name} → ${res.status} | ${res.body?.slice(0, 120)}`)
    })
  } else {
    console.log(`  ⚠ No tasks found — skipping per-task endpoints`)
  }

  // ── 4. Standalone endpoints ──────────────────────────────────
  const standaloneTests = [
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
    { name: 'report/total/eta',
      fn: () => http.get(`${BASE_URL}/api/v2/report/total/eta`, { headers }) },
    { name: 'report/doctor/active',
      fn: () => http.get(`${BASE_URL}/api/v2/report/doctor/active`, { headers }) },
    { name: 'report/doctor/avg',
      fn: () => http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}', { headers }) },
    { name: 'report/day/avg',
      fn: () => http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}', { headers }) },
    { name: 'getQueueLength',
      fn: () => http.get(`${BASE_URL}/api/v2/getQueueLength`, { headers }) },
  ]

  standaloneTests.forEach(({ name, fn }) => {
    const res = fn()
    if (res.status === 401) { headers = authHeaders(true) }
    const ok = check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 })
    if (!ok) console.log(`  ✗ ${name} → ${res.status} | ${res.body?.slice(0, 100)}`)
  })
}
