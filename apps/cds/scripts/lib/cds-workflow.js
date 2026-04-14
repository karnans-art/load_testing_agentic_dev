// CDS — Doctor Workflow
// Full doctor flow matching cds100.js structure:
//   List Page (grouped) → task/users → task/assign → Diagnosis Page (grouped)
// All IDs derived from live API responses — zero hardcoding.

import http from 'k6/http'
import { check, group } from 'k6'
import { authHeaders, getUser, getBaseUrl } from './cds-auth.js'

/**
 * Run the complete doctor workflow for one iteration.
 * Returns early (with logs) if no tasks available.
 */
export function doctorWorkflow() {
  let headers = authHeaders()
  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return

  // ── List Page ──────────────────────────────────────────────
  let tasks = []
  group('List Page', () => {
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

    const countRes = http.post(`${BASE_URL}/api/v2/tasks/count`, '{}', { headers, tags: { name: 'tasks/count' } })
    check(countRes, { 'tasks/count ok': (r) => r.status === 200 })

    const tasksV2Res = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers, tags: { name: 'tasks/v2' } })
    check(tasksV2Res, { 'tasks/v2 ok': (r) => r.status === 200 })

    http.get(`${BASE_URL}/api/v2/user`, { headers, tags: { name: 'user' } })
    http.get(`${BASE_URL}/api/v2/config`, { headers, tags: { name: 'config' } })
    http.get(`${BASE_URL}/api/v2/config/version/viewer`, { headers, tags: { name: 'config/version/viewer' } })
    http.get(`${BASE_URL}/api/v2/language`, { headers, tags: { name: 'language' } })
    http.get(`${BASE_URL}/api/v2/report/total/eta`, { headers, tags: { name: 'report/total/eta' } })
    http.get(`${BASE_URL}/api/v2/report/doctor/active`, { headers, tags: { name: 'report/doctor/active' } })
    http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}', { headers, tags: { name: 'report/doctor/avg' } })
    http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}', { headers, tags: { name: 'report/day/avg' } })
    http.get(`${BASE_URL}/api/v2/getQueueLength`, { headers, tags: { name: 'getQueueLength' } })

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
      const nextEcgRes = http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers, tags: { name: 'nextEcg' } })
      check(nextEcgRes, { 'nextEcg ok': (r) => r.status === 200 })

      const algoRes = http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, { headers, tags: { name: 'tasks/algo' } })
      check(algoRes, { 'tasks/algo ok': (r) => r.status === 200 })

      const ecgDataRes = http.get(`${BASE_URL}/api/v2/ecgData/${task.taskId}`, { headers, tags: { name: 'ecgData' } })
      check(ecgDataRes, { 'ecgData ok': (r) => r.status === 200 })

      const patientRes = http.get(`${BASE_URL}/api/v2/patient/${task.taskId}/`, { headers, tags: { name: 'patient' } })
      check(patientRes, { 'patient ok': (r) => r.status === 200 })

      const historyRes = http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, { headers, tags: { name: 'tasks/history/count' } })
      check(historyRes, { 'tasks/history/count ok': (r) => r.status === 200 })

      const commentsRes = http.get(`${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, { headers, tags: { name: 'case/comments/history' } })
      check(commentsRes, { 'case/comments/history ok': (r) => r.status === 200 })
    })
  }
}
