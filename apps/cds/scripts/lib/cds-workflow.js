// CDS — Doctor Workflow
// Full doctor flow matching cds100.js structure:
//   List Page (grouped, batch) → task/users → task/assign → Diagnosis Page (grouped)
// All IDs derived from live API responses — zero hardcoding.

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { authHeaders, getUser, getBaseUrl } from './cds-auth.js'
import {
  dashboardLoadDuration, taskListDuration, ecgViewerLoadDuration,
  queueCheckDuration, apiSuccessRate, apiErrorCount,
} from './cds-metrics.js'

/**
 * Build shift payload for report APIs (doctor/avg, day/avg).
 */
function buildShiftPayload() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return JSON.stringify({
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  })
}

/**
 * Run the complete doctor workflow for one iteration.
 * Returns early if no tasks available.
 */
export function doctorWorkflow() {
  let headers = authHeaders()
  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return

  // ── List Page ──────────────────────────────────────────────
  let tasks = []
  group('List Page', () => {
    const dashStart = Date.now()

    // Anchor call — tasks/latest (sequential, needed for 401 retry)
    let tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers, tags: { name: 'tasks/latest' } })
    if (tasksRes.status === 401) {
      headers = authHeaders(true)
      tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
        filter: { doctorName: user.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
        sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
      }), { headers, tags: { name: 'tasks/latest' } })
    }
    check(tasksRes, { 'tasks/latest ok': (r) => r.status === 200 })
    taskListDuration.add(Date.now() - dashStart)

    // Dashboard batch — parallel calls (mimics real browser behavior)
    const shiftPayload = buildShiftPayload()
    const batchRes = http.batch([
      ['POST', `${BASE_URL}/api/v2/tasks/count`, '{}', { headers, tags: { name: 'tasks/count' } }],
      ['POST', `${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers, tags: { name: 'tasks/v2' } }],
      ['GET', `${BASE_URL}/api/v2/user`, null, { headers, tags: { name: 'user' } }],
      ['GET', `${BASE_URL}/api/v2/config`, null, { headers, tags: { name: 'config' } }],
      ['GET', `${BASE_URL}/api/v2/config/version/viewer`, null, { headers, tags: { name: 'config/version/viewer' } }],
      ['GET', `${BASE_URL}/api/v2/language`, null, { headers, tags: { name: 'language' } }],
      ['GET', `${BASE_URL}/api/v2/report/total/eta`, null, { headers, tags: { name: 'report/total/eta' } }],
      ['GET', `${BASE_URL}/api/v2/report/doctor/active`, null, { headers, tags: { name: 'report/doctor/active' } }],
      ['POST', `${BASE_URL}/api/v2/report/doctor/avg`, shiftPayload, { headers, tags: { name: 'report/doctor/avg' } }],
      ['POST', `${BASE_URL}/api/v2/report/day/avg`, shiftPayload, { headers, tags: { name: 'report/day/avg' } }],
      ['GET', `${BASE_URL}/api/v2/getQueueLength`, null, { headers, tags: { name: 'getQueueLength' } }],
    ])

    // Check each batch response individually
    const dashNames = ['tasks/count', 'tasks/v2', 'user', 'config', 'config/version/viewer', 'language', 'report/total/eta', 'report/doctor/active', 'report/doctor/avg', 'report/day/avg', 'getQueueLength']
    batchRes.forEach((r, i) => {
      const name = dashNames[i]
      check(r, { [`${name} ok`]: (res) => res.status === 200 })
      const ok = r.status >= 200 && r.status < 300
      apiSuccessRate.add(ok ? 1 : 0)
      if (!ok) apiErrorCount.add(1)
    })

    dashboardLoadDuration.add(Date.now() - dashStart)

    // Queue check metric
    const queueRes = batchRes[batchRes.length - 1]
    if (queueRes) queueCheckDuration.add(queueRes.timings.duration)

    try {
      const body = tasksRes.json()
      tasks = body.tasks || body
      if (!Array.isArray(tasks)) tasks = []
    } catch (_) {}
  })

  // ── Diagnosis Page — loop through each task ───────────────
  for (const task of tasks) {
    // Fetch assignable doctors, then assign this task
    const usersRes = http.get(`${BASE_URL}/api/v2/task/${task.taskId}/users?role=undefined`, { headers, tags: { name: 'task/users' } })
    check(usersRes, { 'task/users ok': (r) => r.status === 200 })

    let assignable = []
    try { assignable = usersRes.json().users || [] } catch (_) {}
    const me = assignable.find(u => u.username.toLowerCase() === user.username.toLowerCase())
    if (me) {
      const assignRes = http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({
        assignments: [{ username: me.username, taskId: task.taskId, role: 'DOCTOR' }],
      }), { headers, tags: { name: 'task/assign' } })
      check(assignRes, { 'task/assign ok': (r) => r.status >= 200 && r.status < 300 })
    }

    group('Diagnosis Page', () => {
      const viewerStart = Date.now()

      const nextEcgRes = http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers, tags: { name: 'nextEcg' } })
      check(nextEcgRes, { 'nextEcg ok': (r) => r.status === 200 })

      // Viewer batch — parallel calls for case data
      const viewerBatch = http.batch([
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, null, { headers, tags: { name: 'tasks/algo' } }],
        ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers, tags: { name: 'ecgData' } }],
        ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers, tags: { name: 'patient' } }],
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, null, { headers, tags: { name: 'tasks/history/count' } }],
        ['GET', `${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, null, { headers, tags: { name: 'case/comments/history' } }],
      ])

      const viewerNames = ['tasks/algo', 'ecgData', 'patient', 'tasks/history/count', 'case/comments/history']
      viewerBatch.forEach((r, i) => {
        const name = viewerNames[i]
        check(r, { [`${name} ok`]: (res) => res.status === 200 })
        const ok = r.status >= 200 && r.status < 300
        apiSuccessRate.add(ok ? 1 : 0)
        if (!ok) apiErrorCount.add(1)
      })

      ecgViewerLoadDuration.add(Date.now() - viewerStart)
    })
  }
}

/**
 * Simulated think time — random sleep between actions.
 */
export function randomSleep(min = 1, max = 5) {
  sleep(min + Math.random() * (max - min))
}
