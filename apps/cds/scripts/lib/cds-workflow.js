// CDS — Doctor Workflow
// Full doctor flow matching cds100.js structure:
//   List Page (grouped, batch) → task/users → task/assign → Diagnosis Page (grouped)
// All IDs derived from live API responses — zero hardcoding.

import http from 'k6/http'
import ws from 'k6/ws'
import { check, group, sleep } from 'k6'
import { authHeaders, getUser, getBaseUrl } from './cds-auth.js'
import {
  dashboardLoadDuration, taskListDuration, ecgViewerLoadDuration,
  queueCheckDuration, diagnosisSubmitDuration, casesProcessedCount,
  apiSuccessRate, apiErrorCount,
} from './cds-metrics.js'

const INVOKER_ENABLED = (__ENV.INVOKER_ENABLED || 'false').toLowerCase() === 'true'

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

    if (INVOKER_ENABLED && user.isPreferred === true) {
      // Invoker ON + confirmed preferred doctor → use tasks/latest (auto-assigned)
      try {
        const body = tasksRes.json()
        const allTasks = body.tasks || body
        if (Array.isArray(allTasks)) {
          tasks = allTasks.filter(t => t && t.taskId && t.taskId !== 'undefined' && t.stage !== 'DIAGNOSED')
        }
      } catch (_) {}
    } else {
      // Invoker OFF, non-preferred, OR isPreferred not yet detected → tasks/v2 UNDIAGNOSED
      // isPreferred will be detected in the Diagnosis Page block below (task/users call)
      const v2Res = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
        filter: { pageNo: 1, perPage: 10, stage: 'UNDIAGNOSED', taskTypes: 'RESTING' },
        sortBy: { datetime: { enable: true, order: 'DESC' } },
      }), { headers, tags: { name: 'tasks/v2-undiagnosed' } })
      try {
        const v2Body = v2Res.json()
        const v2Tasks = v2Body.tasks || v2Body
        if (Array.isArray(v2Tasks)) {
          tasks = v2Tasks.filter(t => t && t.taskId && t.taskId !== 'undefined')
        }
      } catch (_) {}
    }
  })

  if (tasks.length === 0) {
    console.log(`[VU${__VU}] No valid tasks — skipping diagnosis page`)
    return
  }

  // ── Diagnosis Page — loop through each task ───────────────
  for (const task of tasks) {
    // Manual assign block — runs when NOT (Invoker ON + confirmed preferred)
    // Also used for one-time isPreferred detection on first iteration
    let skipTask = false
    if (!(INVOKER_ENABLED && user.isPreferred === true) && !task.assignedAt) {
      const usersRes = http.get(`${BASE_URL}/api/v2/task/${task.taskId}/users?role=undefined`, { headers, tags: { name: 'task/users' } })
      check(usersRes, { 'task/users ok': (r) => r.status === 200 })

      let assignable = []
      try { assignable = usersRes.json().users || [] } catch (_) {}
      const me = assignable.find(u => u.username.toLowerCase() === user.username.toLowerCase())

      // ── One-time isPreferred detection ──────────────────────
      if (me && user.isPreferred === undefined) {
        user.isPreferred = me.isPreferred
        console.log(`[VU${__VU}] ${user.username} isPreferred: ${user.isPreferred}`)
      }

      if (INVOKER_ENABLED && user.isPreferred === true) {
        // Just detected as preferred + Invoker ON
        // Skip this task — next iteration will use Invoker path (tasks/latest)
        console.log(`[VU${__VU}] Preferred doctor detected — switching to Invoker path next cycle`)
        skipTask = true
      } else if (me) {
        // Non-preferred OR Invoker OFF → manual assign
        const assignRes = http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({
          assignments: [{ username: me.username, taskId: task.taskId, role: 'DOCTOR' }],
        }), { headers, tags: { name: 'task/assign' } })
        check(assignRes, { 'task/assign ok': (r) => r.status >= 200 && r.status < 300 })
      }
    }
    if (skipTask) break

    group('Diagnosis Page', () => {
      const viewerStart = Date.now()

      const nextEcgRes = http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers, tags: { name: 'nextEcg' } })
      check(nextEcgRes, { 'nextEcg ok': (r) => r.status === 200 })

      // Viewer batch — parallel calls for case data
      const caseId = task.caseId || task.taskId
      const viewerBatch = http.batch([
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, null, { headers, tags: { name: 'tasks/algo' } }],
        ['GET', `${BASE_URL}/api/v2/ecgData/${task.taskId}`, null, { headers, tags: { name: 'ecgData' } }],
        ['GET', `${BASE_URL}/api/v2/patient/${task.taskId}/`, null, { headers, tags: { name: 'patient' } }],
        ['GET', `${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, null, { headers, tags: { name: 'tasks/history/count' } }],
        ['GET', `${BASE_URL}/api/v2/case/${caseId}/comments/history`, null, { headers, tags: { name: 'case/comments/history' } }],
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
 * Submit diagnosis for a task.
 * Uses TEXT-based diagnosis (LoadTest3 domain config).
 * Call after opening the case (nextEcg + ecgData).
 */
export function diagnoseTask(taskId, username) {
  const BASE_URL = getBaseUrl()
  let headers = authHeaders()

  const diagStart = Date.now()
  const diagRes = http.post(`${BASE_URL}/api/v2/diagnose/${taskId}`, JSON.stringify({
    action: 'send',
    diagnosedBy: username,
    hubEcgType: 'RESTING',
    metadata: {
      autoDiagnose: false, isQTCDerived: true, QTCMeasurement: 'qtijti',
      centerTimeZone: 'Asia/Kolkata', sbradThreshold: '55BPM',
      repeatCasesInfo: { isCaseRepeated: false, repeatThreshold: '30' },
      appendNormalAxis: 1, interpretationRules: [],
      originalMachineMeasurements: '{"AtrialRate":74,"ECGSampleBase":500,"ECGSampleExponent":0,"PAxis":51,"POffset":378,"POnset":292,"PRInterval":146,"QOffset":512,"QOnset":438,"QRSCount":12,"QRSDuration":74,"QTCorrected":99,"QTInterval":374,"RAxis":74,"TAxis":51,"TOffset":812,"VentricularRate":74,"RRInterval":811}',
      suppressNormalClassification: 'NO', suppressAbnormalClassification: 'NO', suppressCriticalClassification: 'NO',
      FIPRCodeMapping: '',
      thaMeasurements: { AtrialRate: 73, PAxis: 53, POffset: null, POnset: null, PRInterval: 156, QOffset: null, QOnset: null, QRSCount: null, QTCorrected: 95, QTInterval: 360, RAxis: 73, TAxis: 43, TOffset: null, VentricularRate: 74, QRSDuration: 84, QTCorrectedBazett: null, QTCorrectedFramingham: null, QTCorrectedFridericia: null, QTCorrectedQtiJti: null, RRVar: 11 },
    },
    isTelegramEcg: false, manualRequestForRepeat: false, isCritical: 0, shownType: '', timeStart: '',
    finalClassification: {
      selectedComments: [], overridden: false, selectedCodes: [],
      viewerVersion: '', diagnosisType: 'TEXT', consentOnEmptyMeasurement: null,
      diagnosis: 'Normal sinus rhythm. Load test diagnosis.',
      status: 'Normal ECG',
    },
    viewerVersion: '2.5',
    measurements: {
      finalMachineMeasurements: { AtrialRate: 74, ECGSampleBase: 500, ECGSampleExponent: 0, PAxis: 51, POffset: 378, POnset: 292, PRInterval: 146, QOffset: 512, QOnset: 438, QRSCount: 12, QRSDuration: 74, QTCorrected: 99, QTInterval: 374, RAxis: 74, TAxis: 51, TOffset: 812, VentricularRate: 74, RRInterval: 811 },
      initialMachineMeasurements: { AtrialRate: 74, ECGSampleBase: 500, ECGSampleExponent: 0, PAxis: 51, POffset: 378, POnset: 292, PRInterval: 146, QOffset: 512, QOnset: 438, QRSCount: 12, QRSDuration: 74, QTCorrected: 99, QTInterval: 374, RAxis: 74, TAxis: 51, TOffset: 812, VentricularRate: 74, RRInterval: 811 },
    },
    isRequestForRepeat: false,
    status: 'Normal ECG',
    diagnosis: 'Normal sinus rhythm. Load test diagnosis.',
    diagnosisCode: null,
  }), { headers, tags: { name: 'diagnose' } })

  const ok = check(diagRes, { 'diagnose ok': (r) => r.status === 200 })
  diagnosisSubmitDuration.add(Date.now() - diagStart)
  apiSuccessRate.add(ok ? 1 : 0)
  if (ok) casesProcessedCount.add(1)
  if (!ok) {
    apiErrorCount.add(1)
    console.error(`[VU${__VU}] diagnose ${taskId.slice(0,8)} failed: ${diagRes.status} — ${diagRes.body?.substring(0, 200)}`)
  }

  return ok
}

/**
 * Simulated think time — random sleep between actions.
 */
export function randomSleep(min = 1, max = 5) {
  sleep(min + Math.random() * (max - min))
}

/**
 * Logout all doctors — call in teardown() to release queue stickiness.
 * Logs in as each user, marks inactive, closes WebSocket, and logs out.
 */
export function logoutAllDoctors(users, vuCount) {
  const BASE_URL = getBaseUrl()
  const wsBase = BASE_URL.replace('https://', 'wss://')
  const HDRS = { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'clientdevicetype': 'Linux x86_64', 'clientos': 'INSTA_ECG_VIEWER', 'clientosversion': '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'clientversion': '0.14.5', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' }

  console.log(`Logging out ${vuCount} doctors...`)
  for (let i = 0; i < vuCount; i++) {
    const user = users[i]
    if (!user) continue
    const loginRes = http.post(`${BASE_URL}/api/v2/login`, JSON.stringify({
      domainId: user.domainId, username: user.username, password: user.password,
      application: 'INSTA_ECG_VIEWER', appVersion: '3.0.0',
    }), { headers: HDRS })
    const token = loginRes.json('token')
    if (!token) continue
    const h = { ...HDRS, 'token': token }

    // 1. Mark inactive
    http.post(`${BASE_URL}/api/v2/updateActive`, JSON.stringify({ isActive: 0, captureEvent: false }), { headers: h })

    // 2. Open and immediately close WebSocket (clears server-side presence)
    try {
      ws.connect(`${wsBase}/api/v2/socket.io/?channel=${token}&EIO=3&transport=websocket`, {}, function (socket) {
        socket.close()
      })
    } catch (_) {}

    // 3. Logout with correct body
    http.post(`${BASE_URL}/api/v2/logout`, JSON.stringify({ inactive: false }), { headers: h })
  }
  console.log('All doctors logged out')
}
