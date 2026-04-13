import http from 'k6/http';
import { check, sleep, group } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net';
const ADMIN_URL = __ENV.SIMULATOR_ADMIN_URL || 'https://uat-admin.tricogdev.net';
const USERS = JSON.parse(open('../apps/cds/users.json')).users;
const CSI_FILE = open('../apps/cds/fixtures/sample.csi', 'b');

// ── Paste your admin cookie here ─────────────────────────────
const ADMIN_COOKIE = __ENV.TRICOG_ADMIN_COOKIE || 'tricogadmin=s%3APD3GqTNwDUWQvAqawTrV9RrOqaBhtF5B.txKCgc%2BeoTuqAG00SotrjWk6%2B5%2Fi0uwOCbRduoSLEG8';

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
  scenarios: {
    simulator: {
      executor:        'constant-arrival-rate',
      rate:            6,
      timeUnit:        '1m',       // 6 cases/min = 1 every 10s
      duration:        '20s',
      preAllocatedVUs: 1,
      maxVUs:          2,
      exec:            'simulatorPush',
    },
    doctors: {
      executor:    'per-vu-iterations',
      vus:         USERS.length,
      iterations:  100,
      maxDuration: '20s',
      exec:        'doctorFlow',
      startTime:   '2s',          // give simulator a head start
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

// ── VU-local state (for doctor VUs) ─────────────────────────
let _token = null;
let _doctorName = null;
let _username = null;

function login() {
  if (_token) return;
  _doctorName = null;

  const user = USERS[(exec.vu.idInInstance - 1) % USERS.length];
  const res = http.post(`${BASE_URL}/api/v2/login`, JSON.stringify({
    domainId:    user.domainId,
    username:    user.username,
    password:    user.password,
    application: 'INSTA_ECG_VIEWER',
    appVersion:  '3.0.0',
  }), { headers: HEADERS });

  check(res, { 'login ok': (r) => r.status === 200 });
  _token = res.json('token');
  if (!_token) {
    console.error(`[VU${__VU}] Login failed: ${res.status}`);
    return;
  }

  const h = { ...HEADERS, token: _token };

  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: h });

  const profileRes = http.get(`${BASE_URL}/api/v2/user`, { headers: h });
  const profile = profileRes.json();
  _username = user.username;
  _doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || user.username;

  console.log(`[VU${__VU}] idInInstance=${exec.vu.idInInstance} → user=${user.username} — doctor: ${_doctorName}`);
}

// ── Scenario 1: Simulator — pushes cases continuously ───────
export function simulatorPush() {
  const res = http.post(`${ADMIN_URL}/api/case/simulator`, {
    centerId:  '3520',
    caseType:  'RESTING',
    clientUrl: 'http://cloud-server/simulate',
    deviceId:  'HE-BE68A686',
    file:      http.file(CSI_FILE, 'sample.csi', 'application/octet-stream'),
  }, {
    headers: {
      'cookie':          ADMIN_COOKIE,
      'x-custom-header': 'foobar',
    },
    tags: { name: 'simulator' },
  });

  const ok = check(res, { 'simulator push ok': (r) => r.status >= 200 && r.status < 300 });
  if (!ok) {
    console.error(`Simulator push failed: ${res.status} — ${res.body?.slice(0, 200)}`);
  }
}

// ── Scenario 2: Doctors — list + diagnose loop ──────────────
export function doctorFlow() {
  login();
  if (!_token) { sleep(1); return; }
  const h = { ...HEADERS, token: _token };

  // ── List Page ──────────────────────────────────────────────
  let tasks = [];
  group('List Page', () => {
    const tasksRes = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({
      filter: { doctorName: _doctorName, pageNo: 1, perPage: 25, stage: 'ASSIGNED_DIAGNOSED', taskTypes: 'RESTING' },
      sortBy: { datetime: { enable: false }, timeread: { enable: true, order: 'DESC' }, assignedAt: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/latest' } });
    check(tasksRes, { 'tasks/latest ok': (r) => r.status === 200 });

    const countRes = http.post(`${BASE_URL}/api/v2/tasks/count`, '{}', { headers: h, tags: { name: 'tasks/count' } });
    check(countRes, { 'tasks/count ok': (r) => r.status === 200 });

    const tasksV2Res = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({
      filter: { pageNo: 1, perPage: 10, startDate: '', endDate: '', caseId: '', patientId: '', taskTypes: 'RESTING', centerName: '', critical: null, state: '', stage: null, view: 'ALL' },
      sortBy: { datetime: { enable: true, order: 'DESC' } },
    }), { headers: h, tags: { name: 'tasks/v2' } });
    const v2Ok = check(tasksV2Res, { 'tasks/v2 ok': (r) => r.status === 200 });
    if (!v2Ok) {
      console.error(`[VU${__VU}] tasks/v2 failed: ${tasksV2Res.status} — ${tasksV2Res.body?.substring(0, 300)}`);
    }

    const userRes = http.get(`${BASE_URL}/api/v2/user`, { headers: h, tags: { name: 'user' } });
    check(userRes, { 'user ok': (r) => r.status === 200 });

    const configRes = http.get(`${BASE_URL}/api/v2/config`, { headers: h, tags: { name: 'config' } });
    check(configRes, { 'config ok': (r) => r.status === 200 });

    const viewerRes = http.get(`${BASE_URL}/api/v2/config/version/viewer`, { headers: h, tags: { name: 'config/version/viewer' } });
    check(viewerRes, { 'config/version/viewer ok': (r) => r.status === 200 });

    const langRes = http.get(`${BASE_URL}/api/v2/language`, { headers: h, tags: { name: 'language' } });
    check(langRes, { 'language ok': (r) => r.status === 200 });

    const etaRes = http.get(`${BASE_URL}/api/v2/report/total/eta`, { headers: h, tags: { name: 'report/total/eta' } });
    check(etaRes, { 'report/total/eta ok': (r) => r.status === 200 });

    const activeRes = http.get(`${BASE_URL}/api/v2/report/doctor/active`, { headers: h, tags: { name: 'report/doctor/active' } });
    check(activeRes, { 'report/doctor/active ok': (r) => r.status === 200 });

    const doctorAvgRes = http.post(`${BASE_URL}/api/v2/report/doctor/avg`, '{}', { headers: h, tags: { name: 'report/doctor/avg' } });
    check(doctorAvgRes, { 'report/doctor/avg ok': (r) => r.status === 200 });

    const dayAvgRes = http.post(`${BASE_URL}/api/v2/report/day/avg`, '{}', { headers: h, tags: { name: 'report/day/avg' } });
    check(dayAvgRes, { 'report/day/avg ok': (r) => r.status === 200 });

    const queueRes = http.get(`${BASE_URL}/api/v2/getQueueLength`, { headers: h, tags: { name: 'getQueueLength' } });
    check(queueRes, { 'getQueueLength ok': (r) => r.status === 200 });

    try {
      const body = tasksRes.json();
      tasks = body.tasks || body;
      if (!Array.isArray(tasks)) tasks = [];
    } catch (_) {}
  });

  // ── Diagnosis Page — loop through each task ───────────────
  for (const task of tasks) {
    // Fetch assignable doctors, then assign this task
    const usersRes = http.get(`${BASE_URL}/api/v2/task/${task.taskId}/users?role=undefined`, { headers: h, tags: { name: 'task/users' } });
    check(usersRes, { 'task/users ok': (r) => r.status === 200 });

    let assignable = [];
    try { assignable = usersRes.json().users || []; } catch (_) {}
    const me = assignable.find(u => u.username.toLowerCase() === _username.toLowerCase());
    if (me) {
      const assignRes = http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({
        assignments: [{ username: me.username, taskId: task.taskId, role: 'DOCTOR' }],
      }), { headers: h, tags: { name: 'task/assign' } });
      const assignOk = check(assignRes, { 'task/assign ok': (r) => r.status >= 200 && r.status < 300 });
      if (!assignOk) {
        console.error(`[VU${__VU}] task/assign failed: ${assignRes.status} — ${assignRes.body?.substring(0, 300)}`);
      }
    }

    group('Diagnosis Page', () => {
      const nextEcgRes = http.get(`${BASE_URL}/api/v2/nextEcg?id=${task.taskId}&assignedAt=${task.assignedAt}`, { headers: h, tags: { name: 'nextEcg' } });
      check(nextEcgRes, { 'nextEcg ok': (r) => r.status === 200 });

      const algoRes = http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/algo`, { headers: h, tags: { name: 'tasks/algo' } });
      check(algoRes, { 'tasks/algo ok': (r) => r.status === 200 });

      const ecgDataRes = http.get(`${BASE_URL}/api/v2/ecgData/${task.taskId}`, { headers: h, tags: { name: 'ecgData' } });
      check(ecgDataRes, { 'ecgData ok': (r) => r.status === 200 });

      const patientRes = http.get(`${BASE_URL}/api/v2/patient/${task.taskId}/`, { headers: h, tags: { name: 'patient' } });
      check(patientRes, { 'patient ok': (r) => r.status === 200 });

      const historyRes = http.get(`${BASE_URL}/api/v2/tasks/${task.taskId}/history/count`, { headers: h, tags: { name: 'tasks/history/count' } });
      check(historyRes, { 'tasks/history/count ok': (r) => r.status === 200 });

      const commentsRes = http.get(`${BASE_URL}/api/v2/case/${task.caseId}/comments/history`, { headers: h, tags: { name: 'case/comments/history' } });
      check(commentsRes, { 'case/comments/history ok': (r) => r.status === 200 });
    });
  }

  sleep(1);
}

export function setup() {
  console.log(`Starting — ${USERS.length} doctor VUs + simulator pushing cases`);
}

export function teardown() {
  console.log('Test complete');
}
