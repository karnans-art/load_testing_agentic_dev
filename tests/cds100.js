import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net';

const HEADERS = {
  'Accept':           'application/json, text/plain, */*',
  'Content-Type':     'application/json',
  'clientdevicetype': 'Linux x86_64',
  'clientos':         'INSTA_ECG_VIEWER',
  'clientversion':    '0.14.4',
  'user-agent':       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  'token':            '',
};

export const options = {
  vus: 1,
  duration: '20s',
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

export function setup() {
  // Login and return token for VUs
  const res = http.post(`${BASE_URL}/api/v2/login`, JSON.stringify({
    domainId:    'Uatdomain3',
    username:    'Karnan',
    password:    'tricog123',
    application: 'INSTA_ECG_VIEWER',
    appVersion:  '3.0.0',
  }), { headers: HEADERS });

  check(res, { 'login ok': (r) => r.status === 200 });
  const token = res.json('token');
  if (!token) {
    console.error(`Login failed: ${res.status} — ${res.body}`);
    return {};
  }

  // Mark doctor active
  const authed = { ...HEADERS, token };
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: authed });

  // Get doctor profile
  const profileRes = http.get(`${BASE_URL}/api/v2/user`, { headers: authed });
  const profile = profileRes.json();
  const doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || 'Karnan';

  // Fetch a task for task-dependent endpoints
  const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
    filter: { doctorName, pageNo: 1, perPage: 5, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
    sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
  }), { headers: authed });

  let taskId = null, caseId = null, assignedAt = null;
  try {
    const body = tasksRes.json();
    const tasks = body.tasks || body;
    if (Array.isArray(tasks) && tasks.length > 0) {
      taskId    = tasks[0].taskId;
      caseId    = tasks[0].caseId;
      assignedAt = tasks[0].assignedAt;
    }
  } catch (_) {}

  console.log(`Setup done — doctor: ${doctorName}, task: ${taskId || 'none'}`);
  return { token, doctorName, taskId, caseId, assignedAt };
}

export default function (data) {
  if (!data.token) { sleep(1); return; }
  const h = { ...HEADERS, token: data.token };

  // ── List Page ──────────────────────────────────────────────
  group('List Page', () => {
    // Fetch fresh task list each iteration
    const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: data.doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/latest' } });

    http.post(`${BASE_URL}/api/v2/tasks/count`, '{}', { headers: h, tags: { name: 'tasks/count' } });
    http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, taskTypes: 'RESTING', view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2' } });

    http.get(`${BASE_URL}/api/v2/user`,                    { headers: h, tags: { name: 'user' } });
    http.get(`${BASE_URL}/api/v2/config`,                  { headers: h, tags: { name: 'config' } });
    http.get(`${BASE_URL}/api/v2/config/version/viewer`,   { headers: h, tags: { name: 'config/version/viewer' } });
    http.get(`${BASE_URL}/api/v2/language`,                { headers: h, tags: { name: 'language' } });
    http.get(`${BASE_URL}/api/v2/report/total/eta`,        { headers: h, tags: { name: 'report/total/eta' } });
    http.get(`${BASE_URL}/api/v2/report/doctor/active`,    { headers: h, tags: { name: 'report/doctor/active' } });
    http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}', { headers: h, tags: { name: 'report/doctor/avg' } });
    http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}',   { headers: h, tags: { name: 'report/day/avg' } });
    http.get(`${BASE_URL}/api/v2/getQueueLength`,          { headers: h, tags: { name: 'getQueueLength' } });

    // Parse tasks for diagnosis loop
    let tasks = [];
    try {
      const body = tasksRes.json();
      tasks = body.tasks || body;
      if (!Array.isArray(tasks)) tasks = [];
    } catch (_) {}

    // ── Diagnosis Page — loop through each task ─────────────
    for (const task of tasks) {
      group('Diagnosis Page', () => {
        http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers: h, tags: { name: 'nextEcg' } });
        http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/algo`,          { headers: h, tags: { name: 'tasks/algo' } });
        http.get(`${BASE_URL}/api/v2/ecgData/${task.taskId}`,             { headers: h, tags: { name: 'ecgData' } });
        http.get(`${BASE_URL}/api/v2/patient/${task.taskId}/`,            { headers: h, tags: { name: 'patient' } });
        http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, { headers: h, tags: { name: 'tasks/history/count' } });
        http.get(`${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, { headers: h, tags: { name: 'case/comments/history' } });
      });
    }
  });

  sleep(1);
}

export function teardown(data) {
  if (data.token) {
    console.log(`Teardown — test complete for doctor: ${data.doctorName}`);
  }
}
