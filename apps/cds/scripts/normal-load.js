// CDS — Normal Load Test (Production Replay)
// Generated: 2026-04-08T05:35:21.640Z
// WAF source: waf api data.xlsx
// Total production hits analyzed: 3,28,185
// Time window: 24h
// ⚠️  AUTO-GENERATED — regenerate with: node runner/run.js --app cds --step generate

import http from 'k6/http'
import { check } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net'
const TEST_USERNAME = __ENV.TEST_USERNAME || ''
const TEST_PASSWORD = __ENV.TEST_PASSWORD || ''
const TEST_DOMAIN = __ENV.TEST_DOMAIN || ''

const AUTH_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json;charset=UTF-8',
  'appname': 'ECG',
  'lang': 'en',
}

// ── Metrics ────────────────────────────────────────────────────
const errorRate = new Rate('cds_errors')
const apiDuration = new Trend('cds_api_duration', true)

// ── Traffic Profile Summary ────────────────────────────────────
// POST   /api/v2/tasks/latest                      51100 hits  15.6%  CRITICAL
// GET    /api/v2/nextEcg                           22631 hits  6.9%  CRITICAL
// POST   /api/v2/tasks/v2                           8744 hits  2.7%  CRITICAL
// GET    /api/v2/config/version/viewer              7779 hits  2.4%  CRITICAL
// GET    /api/v2/tasks/{id}/algo                    7140 hits  2.2%  CRITICAL
// GET    /api/v2/ecgData/{id}                       7019 hits  2.1%  CRITICAL
// GET    /api/v2/patient/{id}/                      7018 hits  2.1%  CRITICAL
// GET    /api/v2/tasks/{id}/history/count           6964 hits  2.1%  CRITICAL
// POST   /api/v2/tasks/count                        6868 hits  2.1%  CRITICAL
// GET    /api/v2/case/{id}/comments/history         6824 hits  2.1%  CRITICAL
// POST   /api/v2/diagnose/{id}                      6560 hits  2.0%  CRITICAL
// POST   /api/v2/doctor-stat/                       6535 hits  2.0%  CRITICAL
// GET    /api/v2/user                               5524 hits  1.7%  CRITICAL
// POST   /api/v2/report/doctor/avg                  5065 hits  1.5%  CRITICAL
// GET    /api/v2/config                             4526 hits  1.4%  CRITICAL
// GET    /api/v2/report/total/eta                   4258 hits  1.3%  CRITICAL
// GET    /api/v2/report/doctor/active               4257 hits  1.3%  CRITICAL
// POST   /api/v2/updateActive                       3169 hits  1.0%  HIGH
// POST   /api/v2/report/day/avg                     3083 hits  0.9%  HIGH
// GET    /api/v2/getQueueLength                     2943 hits  0.9%  HIGH
// GET    /firebase-messaging-sw.js                  2462 hits  0.8%  HIGH
// POST   /api/v2/fcm/                               2377 hits  0.7%  HIGH
// GET    /dashboard/latest                          2280 hits  0.7%  HIGH
// GET    /api/v2/language                           1445 hits  0.4%  HIGH
// POST   /webviewer/api/v2/tasks/v2                 1424 hits  0.4%  HIGH
// POST   /webviewer/api/v2/tasks/count              1337 hits  0.4%  HIGH
// GET    /api/v2/viewer2B/configs/3.0               1111 hits  0.3%  HIGH
// POST   /api/v2/getSearchList                       664 hits  0.2%  HIGH
// GET    /api/v2/task/{id}/users                     622 hits  0.2%  HIGH
// GET    /webviewer/api/v2/viewer/criticaltokens/3.0    586 hits  0.2%  HIGH
// GET    /webviewer/api/v2/viewer/statements/3.0     586 hits  0.2%  HIGH
// GET    /webviewer/api/v2/tasks/{id}/algo           483 hits  0.1%  HIGH
// GET    /webviewer/api/v2/tasks/{id}/v2/            450 hits  0.1%  HIGH
// POST   /api/v2/capture-event                       403 hits  0.1%  HIGH
// POST   /api/v2/case/{id}/stage                     361 hits  0.1%  HIGH
// POST   /api/v2/task/assign                         357 hits  0.1%  HIGH
// GET    /api/v2/ecg/reports/{id}                    340 hits  0.1%  HIGH
// GET    /dashboard/cases                            322 hits  0.1%  HIGH
// POST   /webviewer/api/v2/tasks/view/read           317 hits  0.1%  HIGH
// PUT    /webviewer/api/v2/tasks/{id}/diagnose/v2    314 hits  0.1%  HIGH
// GET    /Alert.8d1fe985c26334aab98f.js              312 hits  0.1%  HIGH
// GET    /16.fd16fd16e345e709b615.js                 307 hits  0.1%  HIGH
// GET    /4743c758a952f2bd4a35d4e42afc002b.woff2     302 hits  0.1%  HIGH
// GET    /vendors~index.a840a25741e8ada6a014.js      297 hits  0.1%  HIGH
// GET    /0.6f2c23e881dc5ac7ebbc.js                  296 hits  0.1%  HIGH
// GET    /vendors~InitialComponent.387e2c797db62ce503b0.js    296 hits  0.1%  HIGH
// GET    /index.d238320a8ae5563f6006.js              296 hits  0.1%  HIGH
// GET    /1.f75ea2be2d61f57ab340.js                  296 hits  0.1%  HIGH
// GET    /InitialComponent.542a1003840352e2778f.js    296 hits  0.1%  HIGH
// GET    /af7ae505a9eed503f8b8e6982036873e.woff2     295 hits  0.1%  HIGH
// GET    /dashboard/undiagnosed                      272 hits  0.1%  HIGH
// GET    /2.ea15cc5999efd7d9cf3c.js                  244 hits  0.1%  HIGH
// GET    /5.8d3323411c1c6c5c7a57.js                  234 hits  0.1%  HIGH
// GET    /api/v2/algo-retry/{id}/check               215 hits  0.1%  HIGH
// GET    /favicon.png                                199 hits  0.1%  HIGH
// POST   /api/v2/tasks/{id}/history                  191 hits  0.1%  HIGH
// GET    /12.1f04b3001e169157c46b.js                 190 hits  0.1%  HIGH
// POST   /webviewer/api/v2/task/assign               183 hits  0.1%  MEDIUM
// GET    /webviewer/api/v2/tasks/{id}/v2             148 hits  0.0%  MEDIUM
// POST   /api/v2/login                                94 hits  0.0%  MEDIUM
// GET    /1768de81fa3eef9da9ce4aedc029bc69.mp3        83 hits  0.0%  MEDIUM
// GET    /f8e71ad35962cfd3be1e52bf74de0d18.png        81 hits  0.0%  MEDIUM
// GET    /aa0ba04d7b5c534acbcf55de2dd51b85.png        78 hits  0.0%  MEDIUM
// GET    /13.69dcf4b426feb1619a7d.js                  54 hits  0.0%  MEDIUM
// GET    /api/v2/viewer2B/configs/3.d                 52 hits  0.0%  MEDIUM
// POST   /api/v2/logout                               50 hits  0.0%  MEDIUM
// POST   /api/ecg/prioritize/{id}                     34 hits  0.0%  MEDIUM
// GET    /webviewer/api/v2/config/                    31 hits  0.0%  MEDIUM
// PUT    /webviewer/api/v2/fcm                        28 hits  0.0%  MEDIUM
// GET    /login                                       18 hits  0.0%  MEDIUM
// POST   /api/v2/task/unassign                        16 hits  0.0%  MEDIUM
// GET    /vendors~ChangePasswordPage.ca05805818b6a6beb26c.js     15 hits  0.0%  MEDIUM
// GET    /ChangePasswordPage.b2f8920697d71d7d6dce.js     14 hits  0.0%  MEDIUM
// GET    /0dc031155e8c95fde4674939ba283c7f.svg        13 hits  0.0%  MEDIUM
// GET    /39ab06550bfbe603e5fd499eb11e4124.svg        13 hits  0.0%  MEDIUM
// GET    /webviewer/api/v2/config                     12 hits  0.0%  MEDIUM
// GET    /4338a7e5b73ad6c637e9f5862d05afc1.svg        11 hits  0.0%  MEDIUM
// GET    /bd3392e4012d71acb840fdac3a1316fb.svg        11 hits  0.0%  MEDIUM
// GET    /f15f04a39bcc98752d0f87cb105c56ab.svg        11 hits  0.0%  MEDIUM
// POST   /api/v2/skipecg                              10 hits  0.0%  MEDIUM
// PUT    /webviewer/api/v2/user/active/1              10 hits  0.0%  MEDIUM
// GET    /7a96687b06bdc15390512d9f8e7ac322.svg        10 hits  0.0%  MEDIUM
// GET    /02e6e268c71c6722d316248854a6a954.svg        10 hits  0.0%  MEDIUM
// GET    /9658870853ed4016f00968c347158777.svg         9 hits  0.0%  MEDIUM
// GET    /3cfb220484fc8c23ee9fc3b69d5432d0.png         8 hits  0.0%  MEDIUM
// GET    /error                                        7 hits  0.0%  MEDIUM
// POST   /webviewer/api/v2/tasks/users                 5 hits  0.0%  MEDIUM
// GET    /6df7f2a098409a1a0bf5358264bed5c7.svg         5 hits  0.0%  MEDIUM
// GET    /d30c6762918fdefd958479122a5e528e.mp3         4 hits  0.0%  MEDIUM
// POST   /webviewer/api/v2/tasks/unassign              3 hits  0.0%  MEDIUM
// GET    /api/v2/viewer2B/configs/                     3 hits  0.0%  MEDIUM
// GET    /apple-touch-icon.png                         3 hits  0.0%  MEDIUM
// GET    /apple-touch-icon-precomposed.png             3 hits  0.0%  MEDIUM
// GET    /aca1afc8487411477b2d6a4b0510bffd.svg         2 hits  0.0%  MEDIUM
// POST   /api/v2/unpark/{id}                           2 hits  0.0%  MEDIUM
// GET    /137cf3b3af2b57c98ba41e9cd8b98f16.png         2 hits  0.0%  MEDIUM
// OPTIONS /api/v2/report/doctor/active                  2 hits  0.0%  MEDIUM
// GET    /63f75f6937ccf69232c045344f07ded4.png         2 hits  0.0%  MEDIUM
// POST   /webviewer/api/v2/centerList/v3               2 hits  0.0%  LOW
// GET    /api/v2/live-stats/3                          2 hits  0.0%  LOW
// PUT    /api/v2/user/preferences/copyAlgoMeasurementsToMac      1 hits  0.0%  LOW
// OPTIONS /api/v2/report/total/eta                      1 hits  0.0%  LOW
// GET    /errorPage.18223b18765e861292da.js            1 hits  0.0%  LOW
// GET    /41befd5e1ed08ea51554b1a25aa647c9.png         1 hits  0.0%  LOW
// GET    /api/v2/verify/token/{id}{id}9a6f77f301210024d06f9aaa8aa6      1 hits  0.0%  LOW
// PUT    /webviewer/api/v2/user/active/0               1 hits  0.0%  LOW
// POST   /webviewer/api/v2/login                       1 hits  0.0%  LOW
// OPTIONS /api/v2/user                                  1 hits  0.0%  LOW
// POST   /api/v2/password/forgot                       1 hits  0.0%  LOW
// GET    /robots.txt                                   1 hits  0.0%  LOW
// GET    /Loading                                      1 hits  0.0%  LOW
// GET    /fee66e712a8a08eef5805a46892932ad.woff        1 hits  0.0%  LOW
// POST   /webviewer/api/v2/patientList/v3              1 hits  0.0%  LOW
// HEAD   /forgotpassword                               0 hits  0.0%  LOW
// HEAD   /dashboard/cases                              0 hits  0.0%  LOW
// GET    /api/v2/login-logs                            0 hits  0.0%  LOW
// OPTIONS /api/v2/language                              0 hits  0.0%  LOW
// GET    /14.29b4c4afc09e0fe6b532.js                   0 hits  0.0%  LOW
// GET    /4db35287e5e52cc14cf802a73ce38d1b.png         0 hits  0.0%  LOW
// GET    /api/v2/verify/token/{id}                     0 hits  0.0%  LOW
// GET    /eb15d6afcac523ecf20b530e713c2c6c.png         0 hits  0.0%  LOW
// GET    /password/new                                 0 hits  0.0%  LOW
// GET    /a64e47e0f0c6e52d9cc00bdd0c606958.png         0 hits  0.0%  LOW
// POST   /api/v2/password/update                       0 hits  0.0%  LOW
// GET    /537c970194e2c56d930641d27cd517ad.png         0 hits  0.0%  LOW

// ── Scenarios ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // CRITICAL: 51100 hits → 35.49/min
    post_api_v2_tasks_latest: {
      executor: 'constant-arrival-rate',
      rate: 35,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 7,
      maxVUs: 28,
      exec: 'post_api_v2_tasks_latest',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/latest', priority: 'CRITICAL' },
    },

    // CRITICAL: 22631 hits → 15.72/min
    get_api_v2_nextEcg: {
      executor: 'constant-arrival-rate',
      rate: 16,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 4,
      maxVUs: 16,
      exec: 'get_api_v2_nextEcg',
      tags: { app: 'cds', endpoint: '/api/v2/nextEcg', priority: 'CRITICAL' },
    },

    // CRITICAL: 8744 hits → 6.07/min
    post_api_v2_tasks_v2: {
      executor: 'constant-arrival-rate',
      rate: 6,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_tasks_v2',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/v2', priority: 'CRITICAL' },
    },

    // CRITICAL: 7779 hits → 5.40/min
    get_api_v2_config_version_viewer: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_config_version_viewer',
      tags: { app: 'cds', endpoint: '/api/v2/config/version/viewer', priority: 'CRITICAL' },
    },

    // CRITICAL: 7140 hits → 4.96/min
    get_api_v2_tasks__id__algo: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_tasks__id__algo',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/{id}/algo', priority: 'CRITICAL' },
    },

    // CRITICAL: 7019 hits → 4.87/min
    get_api_v2_ecgData__id_: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_ecgData__id_',
      tags: { app: 'cds', endpoint: '/api/v2/ecgData/{id}', priority: 'CRITICAL' },
    },

    // CRITICAL: 7018 hits → 4.87/min
    get_api_v2_patient__id_: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_patient__id_',
      tags: { app: 'cds', endpoint: '/api/v2/patient/{id}/', priority: 'CRITICAL' },
    },

    // CRITICAL: 6964 hits → 4.84/min
    get_api_v2_tasks__id__history_count: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_tasks__id__history_count',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/{id}/history/count', priority: 'CRITICAL' },
    },

    // CRITICAL: 6868 hits → 4.77/min
    post_api_v2_tasks_count: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_tasks_count',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/count', priority: 'CRITICAL' },
    },

    // CRITICAL: 6824 hits → 4.74/min
    get_api_v2_case__id__comments_history: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_case__id__comments_history',
      tags: { app: 'cds', endpoint: '/api/v2/case/{id}/comments/history', priority: 'CRITICAL' },
    },

    // CRITICAL: 6560 hits → 4.56/min
    post_api_v2_diagnose__id_: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_diagnose__id_',
      tags: { app: 'cds', endpoint: '/api/v2/diagnose/{id}', priority: 'CRITICAL' },
    },

    // CRITICAL: 6535 hits → 4.54/min
    post_api_v2_doctor_stat: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_doctor_stat',
      tags: { app: 'cds', endpoint: '/api/v2/doctor-stat/', priority: 'CRITICAL' },
    },

    // CRITICAL: 5524 hits → 3.84/min
    get_api_v2_user: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_user',
      tags: { app: 'cds', endpoint: '/api/v2/user', priority: 'CRITICAL' },
    },

    // CRITICAL: 5065 hits → 3.52/min
    post_api_v2_report_doctor_avg: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_report_doctor_avg',
      tags: { app: 'cds', endpoint: '/api/v2/report/doctor/avg', priority: 'CRITICAL' },
    },

    // CRITICAL: 4526 hits → 3.14/min
    get_api_v2_config: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_config',
      tags: { app: 'cds', endpoint: '/api/v2/config', priority: 'CRITICAL' },
    },

    // CRITICAL: 4258 hits → 2.96/min
    get_api_v2_report_total_eta: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_report_total_eta',
      tags: { app: 'cds', endpoint: '/api/v2/report/total/eta', priority: 'CRITICAL' },
    },

    // CRITICAL: 4257 hits → 2.96/min
    get_api_v2_report_doctor_active: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_report_doctor_active',
      tags: { app: 'cds', endpoint: '/api/v2/report/doctor/active', priority: 'CRITICAL' },
    },

    // HIGH: 3169 hits → 2.20/min
    post_api_v2_updateActive: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_updateActive',
      tags: { app: 'cds', endpoint: '/api/v2/updateActive', priority: 'HIGH' },
    },

    // HIGH: 3083 hits → 2.14/min
    post_api_v2_report_day_avg: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_report_day_avg',
      tags: { app: 'cds', endpoint: '/api/v2/report/day/avg', priority: 'HIGH' },
    },

    // HIGH: 2943 hits → 2.04/min
    get_api_v2_getQueueLength: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_getQueueLength',
      tags: { app: 'cds', endpoint: '/api/v2/getQueueLength', priority: 'HIGH' },
    },

    // HIGH: 2462 hits → 1.71/min
    get_firebase_messaging_sw_js: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_firebase_messaging_sw_js',
      tags: { app: 'cds', endpoint: '/firebase-messaging-sw.js', priority: 'HIGH' },
    },

    // HIGH: 2377 hits → 1.65/min
    post_api_v2_fcm: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_fcm',
      tags: { app: 'cds', endpoint: '/api/v2/fcm/', priority: 'HIGH' },
    },

    // HIGH: 2280 hits → 1.58/min
    get_dashboard_latest: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_dashboard_latest',
      tags: { app: 'cds', endpoint: '/dashboard/latest', priority: 'HIGH' },
    },

    // HIGH: 1445 hits → 1.00/min
    get_api_v2_language: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_language',
      tags: { app: 'cds', endpoint: '/api/v2/language', priority: 'HIGH' },
    },

    // HIGH: 1424 hits → 0.99/min
    post_webviewer_api_v2_tasks_v2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_tasks_v2',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/v2', priority: 'HIGH' },
    },

    // HIGH: 1337 hits → 0.93/min
    post_webviewer_api_v2_tasks_count: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_tasks_count',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/count', priority: 'HIGH' },
    },

    // HIGH: 1111 hits → 0.77/min
    get_api_v2_viewer2B_configs_3_0: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_viewer2B_configs_3_0',
      tags: { app: 'cds', endpoint: '/api/v2/viewer2B/configs/3.0', priority: 'HIGH' },
    },

    // HIGH: 664 hits → 0.46/min
    post_api_v2_getSearchList: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_getSearchList',
      tags: { app: 'cds', endpoint: '/api/v2/getSearchList', priority: 'HIGH' },
    },

    // HIGH: 622 hits → 0.43/min
    get_api_v2_task__id__users: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_task__id__users',
      tags: { app: 'cds', endpoint: '/api/v2/task/{id}/users', priority: 'HIGH' },
    },

    // HIGH: 586 hits → 0.41/min
    get_webviewer_api_v2_viewer_criticaltokens_3_0: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_viewer_criticaltokens_3_0',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/viewer/criticaltokens/3.0', priority: 'HIGH' },
    },

    // HIGH: 586 hits → 0.41/min
    get_webviewer_api_v2_viewer_statements_3_0: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_viewer_statements_3_0',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/viewer/statements/3.0', priority: 'HIGH' },
    },

    // HIGH: 483 hits → 0.34/min
    get_webviewer_api_v2_tasks__id__algo: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_tasks__id__algo',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/{id}/algo', priority: 'HIGH' },
    },

    // HIGH: 450 hits → 0.31/min
    get_webviewer_api_v2_tasks__id__v2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_tasks__id__v2',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/{id}/v2/', priority: 'HIGH' },
    },

    // HIGH: 403 hits → 0.28/min
    post_api_v2_capture_event: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_capture_event',
      tags: { app: 'cds', endpoint: '/api/v2/capture-event', priority: 'HIGH' },
    },

    // HIGH: 361 hits → 0.25/min
    post_api_v2_case__id__stage: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_case__id__stage',
      tags: { app: 'cds', endpoint: '/api/v2/case/{id}/stage', priority: 'HIGH' },
    },

    // HIGH: 357 hits → 0.25/min
    post_api_v2_task_assign: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_task_assign',
      tags: { app: 'cds', endpoint: '/api/v2/task/assign', priority: 'HIGH' },
    },

    // HIGH: 340 hits → 0.24/min
    get_api_v2_ecg_reports__id_: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_ecg_reports__id_',
      tags: { app: 'cds', endpoint: '/api/v2/ecg/reports/{id}', priority: 'HIGH' },
    },

    // HIGH: 322 hits → 0.22/min
    get_dashboard_cases: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_dashboard_cases',
      tags: { app: 'cds', endpoint: '/dashboard/cases', priority: 'HIGH' },
    },

    // HIGH: 317 hits → 0.22/min
    post_webviewer_api_v2_tasks_view_read: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_tasks_view_read',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/view/read', priority: 'HIGH' },
    },

    // HIGH: 314 hits → 0.22/min
    put_webviewer_api_v2_tasks__id__diagnose_v2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'put_webviewer_api_v2_tasks__id__diagnose_v2',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/{id}/diagnose/v2', priority: 'HIGH' },
    },

    // HIGH: 312 hits → 0.22/min
    get_Alert_8d1fe985c26334aab98f_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_Alert_8d1fe985c26334aab98f_js',
      tags: { app: 'cds', endpoint: '/Alert.8d1fe985c26334aab98f.js', priority: 'HIGH' },
    },

    // HIGH: 307 hits → 0.21/min
    get_16_fd16fd16e345e709b615_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_16_fd16fd16e345e709b615_js',
      tags: { app: 'cds', endpoint: '/16.fd16fd16e345e709b615.js', priority: 'HIGH' },
    },

    // HIGH: 302 hits → 0.21/min
    get_4743c758a952f2bd4a35d4e42afc002b_woff2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_4743c758a952f2bd4a35d4e42afc002b_woff2',
      tags: { app: 'cds', endpoint: '/4743c758a952f2bd4a35d4e42afc002b.woff2', priority: 'HIGH' },
    },

    // HIGH: 297 hits → 0.21/min
    get_vendors_index_a840a25741e8ada6a014_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_vendors_index_a840a25741e8ada6a014_js',
      tags: { app: 'cds', endpoint: '/vendors~index.a840a25741e8ada6a014.js', priority: 'HIGH' },
    },

    // HIGH: 296 hits → 0.21/min
    get_0_6f2c23e881dc5ac7ebbc_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_0_6f2c23e881dc5ac7ebbc_js',
      tags: { app: 'cds', endpoint: '/0.6f2c23e881dc5ac7ebbc.js', priority: 'HIGH' },
    },

    // HIGH: 296 hits → 0.21/min
    get_vendors_InitialComponent_387e2c797db62ce503b0_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_vendors_InitialComponent_387e2c797db62ce503b0_js',
      tags: { app: 'cds', endpoint: '/vendors~InitialComponent.387e2c797db62ce503b0.js', priority: 'HIGH' },
    },

    // HIGH: 296 hits → 0.21/min
    get_index_d238320a8ae5563f6006_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_index_d238320a8ae5563f6006_js',
      tags: { app: 'cds', endpoint: '/index.d238320a8ae5563f6006.js', priority: 'HIGH' },
    },

    // HIGH: 296 hits → 0.21/min
    get_1_f75ea2be2d61f57ab340_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_1_f75ea2be2d61f57ab340_js',
      tags: { app: 'cds', endpoint: '/1.f75ea2be2d61f57ab340.js', priority: 'HIGH' },
    },

    // HIGH: 296 hits → 0.21/min
    get_InitialComponent_542a1003840352e2778f_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_InitialComponent_542a1003840352e2778f_js',
      tags: { app: 'cds', endpoint: '/InitialComponent.542a1003840352e2778f.js', priority: 'HIGH' },
    },

    // HIGH: 295 hits → 0.20/min
    get_af7ae505a9eed503f8b8e6982036873e_woff2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_af7ae505a9eed503f8b8e6982036873e_woff2',
      tags: { app: 'cds', endpoint: '/af7ae505a9eed503f8b8e6982036873e.woff2', priority: 'HIGH' },
    },

    // HIGH: 272 hits → 0.19/min
    get_dashboard_undiagnosed: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_dashboard_undiagnosed',
      tags: { app: 'cds', endpoint: '/dashboard/undiagnosed', priority: 'HIGH' },
    },

    // HIGH: 244 hits → 0.17/min
    get_2_ea15cc5999efd7d9cf3c_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_2_ea15cc5999efd7d9cf3c_js',
      tags: { app: 'cds', endpoint: '/2.ea15cc5999efd7d9cf3c.js', priority: 'HIGH' },
    },

    // HIGH: 234 hits → 0.16/min
    get_5_8d3323411c1c6c5c7a57_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_5_8d3323411c1c6c5c7a57_js',
      tags: { app: 'cds', endpoint: '/5.8d3323411c1c6c5c7a57.js', priority: 'HIGH' },
    },

    // HIGH: 215 hits → 0.15/min
    get_api_v2_algo_retry__id__check: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_algo_retry__id__check',
      tags: { app: 'cds', endpoint: '/api/v2/algo-retry/{id}/check', priority: 'HIGH' },
    },

    // HIGH: 199 hits → 0.14/min
    get_favicon_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_favicon_png',
      tags: { app: 'cds', endpoint: '/favicon.png', priority: 'HIGH' },
    },

    // HIGH: 191 hits → 0.13/min
    post_api_v2_tasks__id__history: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_tasks__id__history',
      tags: { app: 'cds', endpoint: '/api/v2/tasks/{id}/history', priority: 'HIGH' },
    },

    // HIGH: 190 hits → 0.13/min
    get_12_1f04b3001e169157c46b_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_12_1f04b3001e169157c46b_js',
      tags: { app: 'cds', endpoint: '/12.1f04b3001e169157c46b.js', priority: 'HIGH' },
    },

    // MEDIUM: 183 hits → 0.13/min
    post_webviewer_api_v2_task_assign: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_task_assign',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/task/assign', priority: 'MEDIUM' },
    },

    // MEDIUM: 148 hits → 0.10/min
    get_webviewer_api_v2_tasks__id__v2: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_tasks__id__v2',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/{id}/v2', priority: 'MEDIUM' },
    },

    // MEDIUM: 94 hits → 0.07/min
    post_api_v2_login: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_login',
      tags: { app: 'cds', endpoint: '/api/v2/login', priority: 'MEDIUM' },
    },

    // MEDIUM: 83 hits → 0.06/min
    get_1768de81fa3eef9da9ce4aedc029bc69_mp3: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_1768de81fa3eef9da9ce4aedc029bc69_mp3',
      tags: { app: 'cds', endpoint: '/1768de81fa3eef9da9ce4aedc029bc69.mp3', priority: 'MEDIUM' },
    },

    // MEDIUM: 81 hits → 0.06/min
    get_f8e71ad35962cfd3be1e52bf74de0d18_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_f8e71ad35962cfd3be1e52bf74de0d18_png',
      tags: { app: 'cds', endpoint: '/f8e71ad35962cfd3be1e52bf74de0d18.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 78 hits → 0.05/min
    get_aa0ba04d7b5c534acbcf55de2dd51b85_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_aa0ba04d7b5c534acbcf55de2dd51b85_png',
      tags: { app: 'cds', endpoint: '/aa0ba04d7b5c534acbcf55de2dd51b85.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 54 hits → 0.04/min
    get_13_69dcf4b426feb1619a7d_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_13_69dcf4b426feb1619a7d_js',
      tags: { app: 'cds', endpoint: '/13.69dcf4b426feb1619a7d.js', priority: 'MEDIUM' },
    },

    // MEDIUM: 52 hits → 0.04/min
    get_api_v2_viewer2B_configs_3_d: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_viewer2B_configs_3_d',
      tags: { app: 'cds', endpoint: '/api/v2/viewer2B/configs/3.d', priority: 'MEDIUM' },
    },

    // MEDIUM: 50 hits → 0.03/min
    post_api_v2_logout: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_logout',
      tags: { app: 'cds', endpoint: '/api/v2/logout', priority: 'MEDIUM' },
    },

    // MEDIUM: 34 hits → 0.02/min
    post_api_ecg_prioritize__id_: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_ecg_prioritize__id_',
      tags: { app: 'cds', endpoint: '/api/ecg/prioritize/{id}', priority: 'MEDIUM' },
    },

    // MEDIUM: 31 hits → 0.02/min
    get_webviewer_api_v2_config: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_config',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/config/', priority: 'MEDIUM' },
    },

    // MEDIUM: 28 hits → 0.02/min
    put_webviewer_api_v2_fcm: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'put_webviewer_api_v2_fcm',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/fcm', priority: 'MEDIUM' },
    },

    // MEDIUM: 18 hits → 0.01/min
    get_login: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_login',
      tags: { app: 'cds', endpoint: '/login', priority: 'MEDIUM' },
    },

    // MEDIUM: 16 hits → 0.01/min
    post_api_v2_task_unassign: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_task_unassign',
      tags: { app: 'cds', endpoint: '/api/v2/task/unassign', priority: 'MEDIUM' },
    },

    // MEDIUM: 15 hits → 0.01/min
    get_vendors_ChangePasswordPage_ca05805818b6a6beb26c_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_vendors_ChangePasswordPage_ca05805818b6a6beb26c_js',
      tags: { app: 'cds', endpoint: '/vendors~ChangePasswordPage.ca05805818b6a6beb26c.js', priority: 'MEDIUM' },
    },

    // MEDIUM: 14 hits → 0.01/min
    get_ChangePasswordPage_b2f8920697d71d7d6dce_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_ChangePasswordPage_b2f8920697d71d7d6dce_js',
      tags: { app: 'cds', endpoint: '/ChangePasswordPage.b2f8920697d71d7d6dce.js', priority: 'MEDIUM' },
    },

    // MEDIUM: 13 hits → 0.01/min
    get_0dc031155e8c95fde4674939ba283c7f_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_0dc031155e8c95fde4674939ba283c7f_svg',
      tags: { app: 'cds', endpoint: '/0dc031155e8c95fde4674939ba283c7f.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 13 hits → 0.01/min
    get_39ab06550bfbe603e5fd499eb11e4124_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_39ab06550bfbe603e5fd499eb11e4124_svg',
      tags: { app: 'cds', endpoint: '/39ab06550bfbe603e5fd499eb11e4124.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 12 hits → 0.01/min
    get_webviewer_api_v2_config: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_webviewer_api_v2_config',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/config', priority: 'MEDIUM' },
    },

    // MEDIUM: 11 hits → 0.01/min
    get_4338a7e5b73ad6c637e9f5862d05afc1_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_4338a7e5b73ad6c637e9f5862d05afc1_svg',
      tags: { app: 'cds', endpoint: '/4338a7e5b73ad6c637e9f5862d05afc1.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 11 hits → 0.01/min
    get_bd3392e4012d71acb840fdac3a1316fb_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_bd3392e4012d71acb840fdac3a1316fb_svg',
      tags: { app: 'cds', endpoint: '/bd3392e4012d71acb840fdac3a1316fb.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 11 hits → 0.01/min
    get_f15f04a39bcc98752d0f87cb105c56ab_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_f15f04a39bcc98752d0f87cb105c56ab_svg',
      tags: { app: 'cds', endpoint: '/f15f04a39bcc98752d0f87cb105c56ab.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 10 hits → 0.01/min
    post_api_v2_skipecg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_skipecg',
      tags: { app: 'cds', endpoint: '/api/v2/skipecg', priority: 'MEDIUM' },
    },

    // MEDIUM: 10 hits → 0.01/min
    put_webviewer_api_v2_user_active_1: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'put_webviewer_api_v2_user_active_1',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/user/active/1', priority: 'MEDIUM' },
    },

    // MEDIUM: 10 hits → 0.01/min
    get_7a96687b06bdc15390512d9f8e7ac322_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_7a96687b06bdc15390512d9f8e7ac322_svg',
      tags: { app: 'cds', endpoint: '/7a96687b06bdc15390512d9f8e7ac322.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 10 hits → 0.01/min
    get_02e6e268c71c6722d316248854a6a954_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_02e6e268c71c6722d316248854a6a954_svg',
      tags: { app: 'cds', endpoint: '/02e6e268c71c6722d316248854a6a954.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 9 hits → 0.01/min
    get_9658870853ed4016f00968c347158777_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_9658870853ed4016f00968c347158777_svg',
      tags: { app: 'cds', endpoint: '/9658870853ed4016f00968c347158777.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 8 hits → 0.01/min
    get_3cfb220484fc8c23ee9fc3b69d5432d0_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_3cfb220484fc8c23ee9fc3b69d5432d0_png',
      tags: { app: 'cds', endpoint: '/3cfb220484fc8c23ee9fc3b69d5432d0.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 7 hits → 0.00/min
    get_error: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_error',
      tags: { app: 'cds', endpoint: '/error', priority: 'MEDIUM' },
    },

    // MEDIUM: 5 hits → 0.00/min
    post_webviewer_api_v2_tasks_users: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_tasks_users',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/users', priority: 'MEDIUM' },
    },

    // MEDIUM: 5 hits → 0.00/min
    get_6df7f2a098409a1a0bf5358264bed5c7_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_6df7f2a098409a1a0bf5358264bed5c7_svg',
      tags: { app: 'cds', endpoint: '/6df7f2a098409a1a0bf5358264bed5c7.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 4 hits → 0.00/min
    get_d30c6762918fdefd958479122a5e528e_mp3: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_d30c6762918fdefd958479122a5e528e_mp3',
      tags: { app: 'cds', endpoint: '/d30c6762918fdefd958479122a5e528e.mp3', priority: 'MEDIUM' },
    },

    // MEDIUM: 3 hits → 0.00/min
    post_webviewer_api_v2_tasks_unassign: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_tasks_unassign',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/tasks/unassign', priority: 'MEDIUM' },
    },

    // MEDIUM: 3 hits → 0.00/min
    get_api_v2_viewer2B_configs: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_viewer2B_configs',
      tags: { app: 'cds', endpoint: '/api/v2/viewer2B/configs/', priority: 'MEDIUM' },
    },

    // MEDIUM: 3 hits → 0.00/min
    get_apple_touch_icon_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_apple_touch_icon_png',
      tags: { app: 'cds', endpoint: '/apple-touch-icon.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 3 hits → 0.00/min
    get_apple_touch_icon_precomposed_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_apple_touch_icon_precomposed_png',
      tags: { app: 'cds', endpoint: '/apple-touch-icon-precomposed.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 2 hits → 0.00/min
    get_aca1afc8487411477b2d6a4b0510bffd_svg: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_aca1afc8487411477b2d6a4b0510bffd_svg',
      tags: { app: 'cds', endpoint: '/aca1afc8487411477b2d6a4b0510bffd.svg', priority: 'MEDIUM' },
    },

    // MEDIUM: 2 hits → 0.00/min
    post_api_v2_unpark__id_: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_unpark__id_',
      tags: { app: 'cds', endpoint: '/api/v2/unpark/{id}', priority: 'MEDIUM' },
    },

    // MEDIUM: 2 hits → 0.00/min
    get_137cf3b3af2b57c98ba41e9cd8b98f16_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_137cf3b3af2b57c98ba41e9cd8b98f16_png',
      tags: { app: 'cds', endpoint: '/137cf3b3af2b57c98ba41e9cd8b98f16.png', priority: 'MEDIUM' },
    },

    // MEDIUM: 2 hits → 0.00/min
    options_api_v2_report_doctor_active: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'options_api_v2_report_doctor_active',
      tags: { app: 'cds', endpoint: '/api/v2/report/doctor/active', priority: 'MEDIUM' },
    },

    // MEDIUM: 2 hits → 0.00/min
    get_63f75f6937ccf69232c045344f07ded4_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_63f75f6937ccf69232c045344f07ded4_png',
      tags: { app: 'cds', endpoint: '/63f75f6937ccf69232c045344f07ded4.png', priority: 'MEDIUM' },
    },

    // LOW: 2 hits → 0.00/min
    post_webviewer_api_v2_centerList_v3: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_centerList_v3',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/centerList/v3', priority: 'LOW' },
    },

    // LOW: 2 hits → 0.00/min
    get_api_v2_live_stats_3: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_live_stats_3',
      tags: { app: 'cds', endpoint: '/api/v2/live-stats/3', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    put_api_v2_user_preferences_copyAlgoMeasurementsToMac: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'put_api_v2_user_preferences_copyAlgoMeasurementsToMac',
      tags: { app: 'cds', endpoint: '/api/v2/user/preferences/copyAlgoMeasurementsToMac', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    options_api_v2_report_total_eta: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'options_api_v2_report_total_eta',
      tags: { app: 'cds', endpoint: '/api/v2/report/total/eta', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_errorPage_18223b18765e861292da_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_errorPage_18223b18765e861292da_js',
      tags: { app: 'cds', endpoint: '/errorPage.18223b18765e861292da.js', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_41befd5e1ed08ea51554b1a25aa647c9_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_41befd5e1ed08ea51554b1a25aa647c9_png',
      tags: { app: 'cds', endpoint: '/41befd5e1ed08ea51554b1a25aa647c9.png', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_api_v2_verify_token__id__id_9a6f77f301210024d06f9aaa8aa6: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_verify_token__id__id_9a6f77f301210024d06f9aaa8aa6',
      tags: { app: 'cds', endpoint: '/api/v2/verify/token/{id}{id}9a6f77f301210024d06f9aaa8aa6', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    put_webviewer_api_v2_user_active_0: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'put_webviewer_api_v2_user_active_0',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/user/active/0', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    post_webviewer_api_v2_login: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_login',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/login', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    options_api_v2_user: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'options_api_v2_user',
      tags: { app: 'cds', endpoint: '/api/v2/user', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    post_api_v2_password_forgot: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_password_forgot',
      tags: { app: 'cds', endpoint: '/api/v2/password/forgot', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_robots_txt: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_robots_txt',
      tags: { app: 'cds', endpoint: '/robots.txt', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_Loading: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_Loading',
      tags: { app: 'cds', endpoint: '/Loading', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    get_fee66e712a8a08eef5805a46892932ad_woff: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_fee66e712a8a08eef5805a46892932ad_woff',
      tags: { app: 'cds', endpoint: '/fee66e712a8a08eef5805a46892932ad.woff', priority: 'LOW' },
    },

    // LOW: 1 hits → 0.00/min
    post_webviewer_api_v2_patientList_v3: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_webviewer_api_v2_patientList_v3',
      tags: { app: 'cds', endpoint: '/webviewer/api/v2/patientList/v3', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    head_forgotpassword: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'head_forgotpassword',
      tags: { app: 'cds', endpoint: '/forgotpassword', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    head_dashboard_cases: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'head_dashboard_cases',
      tags: { app: 'cds', endpoint: '/dashboard/cases', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_api_v2_login_logs: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_login_logs',
      tags: { app: 'cds', endpoint: '/api/v2/login-logs', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    options_api_v2_language: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'options_api_v2_language',
      tags: { app: 'cds', endpoint: '/api/v2/language', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_14_29b4c4afc09e0fe6b532_js: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_14_29b4c4afc09e0fe6b532_js',
      tags: { app: 'cds', endpoint: '/14.29b4c4afc09e0fe6b532.js', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_4db35287e5e52cc14cf802a73ce38d1b_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_4db35287e5e52cc14cf802a73ce38d1b_png',
      tags: { app: 'cds', endpoint: '/4db35287e5e52cc14cf802a73ce38d1b.png', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_api_v2_verify_token__id_: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_api_v2_verify_token__id_',
      tags: { app: 'cds', endpoint: '/api/v2/verify/token/{id}', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_eb15d6afcac523ecf20b530e713c2c6c_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_eb15d6afcac523ecf20b530e713c2c6c_png',
      tags: { app: 'cds', endpoint: '/eb15d6afcac523ecf20b530e713c2c6c.png', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_password_new: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_password_new',
      tags: { app: 'cds', endpoint: '/password/new', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_a64e47e0f0c6e52d9cc00bdd0c606958_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_a64e47e0f0c6e52d9cc00bdd0c606958_png',
      tags: { app: 'cds', endpoint: '/a64e47e0f0c6e52d9cc00bdd0c606958.png', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    post_api_v2_password_update: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'post_api_v2_password_update',
      tags: { app: 'cds', endpoint: '/api/v2/password/update', priority: 'LOW' },
    },

    // LOW: 0 hits → 0.00/min
    get_537c970194e2c56d930641d27cd517ad_png: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      exec: 'get_537c970194e2c56d930641d27cd517ad_png',
      tags: { app: 'cds', endpoint: '/537c970194e2c56d930641d27cd517ad.png', priority: 'LOW' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    'cds_errors': ['rate<0.05'],
  },
}

// ── Auth ───────────────────────────────────────────────────────
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/v2/login`,
    JSON.stringify({
  domainId: TEST_DOMAIN,
  username: TEST_USERNAME,
  password: TEST_PASSWORD,
  application: "INSTA_ECG_VIEWER",
  appVersion: "3.0.0"
}),
    { headers: AUTH_HEADERS }
  )
  check(res, { '[cds] login ok': (r) => r.status === 200 })
  const token = res.json('token')
  // Post-login: /api/v2/updateActive
  http.post(
    `${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({"isActive":1,"captureEvent":false}),
    { headers: { ...AUTH_HEADERS, 'token': token } }
  )
  // Fetch live profile — payload fields (e.g. doctorName) come from the API response
  const profileRes = http.get(
    `${BASE_URL}/api/v2/user`,
    { headers: { ...AUTH_HEADERS, 'token': token } }
  )
  const profile = profileRes.json()
  const doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || TEST_USERNAME

  return { token, doctorName }
}

// ── Scenario Functions ──────────────────────────────────────────
// POST /api/v2/tasks/latest — 51100 hits (15.6%)
export function post_api_v2_tasks_latest(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/tasks/latest`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/tasks/latest ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/nextEcg — 22631 hits (6.9%)
export function get_api_v2_nextEcg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/nextEcg`, { headers })

  check(res, {
    '[cds] GET /api/v2/nextEcg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/tasks/v2 — 8744 hits (2.7%)
export function post_api_v2_tasks_v2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/tasks/v2`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/tasks/v2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/config/version/viewer — 7779 hits (2.4%)
export function get_api_v2_config_version_viewer(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/config/version/viewer`, { headers })

  check(res, {
    '[cds] GET /api/v2/config/version/viewer ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/tasks/{id}/algo — 7140 hits (2.2%)
export function get_api_v2_tasks__id__algo(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/tasks/{id}/algo`, { headers })

  check(res, {
    '[cds] GET /api/v2/tasks/{id}/algo ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/ecgData/{id} — 7019 hits (2.1%)
export function get_api_v2_ecgData__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/ecgData/{id}`, { headers })

  check(res, {
    '[cds] GET /api/v2/ecgData/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/patient/{id}/ — 7018 hits (2.1%)
export function get_api_v2_patient__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/patient/{id}/`, { headers })

  check(res, {
    '[cds] GET /api/v2/patient/{id}/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/tasks/{id}/history/count — 6964 hits (2.1%)
export function get_api_v2_tasks__id__history_count(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/tasks/{id}/history/count`, { headers })

  check(res, {
    '[cds] GET /api/v2/tasks/{id}/history/count ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/tasks/count — 6868 hits (2.1%)
export function post_api_v2_tasks_count(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/tasks/count`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/tasks/count ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/case/{id}/comments/history — 6824 hits (2.1%)
export function get_api_v2_case__id__comments_history(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/case/{id}/comments/history`, { headers })

  check(res, {
    '[cds] GET /api/v2/case/{id}/comments/history ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/diagnose/{id} — 6560 hits (2.0%)
export function post_api_v2_diagnose__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/diagnose/{id}`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/diagnose/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/doctor-stat/ — 6535 hits (2.0%)
export function post_api_v2_doctor_stat(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/doctor-stat/`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/doctor-stat/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/user — 5524 hits (1.7%)
export function get_api_v2_user(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/user`, { headers })

  check(res, {
    '[cds] GET /api/v2/user ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/report/doctor/avg — 5065 hits (1.5%)
export function post_api_v2_report_doctor_avg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/report/doctor/avg`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/report/doctor/avg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/config — 4526 hits (1.4%)
export function get_api_v2_config(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/config`, { headers })

  check(res, {
    '[cds] GET /api/v2/config ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/report/total/eta — 4258 hits (1.3%)
export function get_api_v2_report_total_eta(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/report/total/eta`, { headers })

  check(res, {
    '[cds] GET /api/v2/report/total/eta ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/report/doctor/active — 4257 hits (1.3%)
export function get_api_v2_report_doctor_active(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/report/doctor/active`, { headers })

  check(res, {
    '[cds] GET /api/v2/report/doctor/active ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/updateActive — 3169 hits (1.0%)
export function post_api_v2_updateActive(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/updateActive`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/updateActive ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/report/day/avg — 3083 hits (0.9%)
export function post_api_v2_report_day_avg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/report/day/avg`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/report/day/avg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/getQueueLength — 2943 hits (0.9%)
export function get_api_v2_getQueueLength(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/getQueueLength`, { headers })

  check(res, {
    '[cds] GET /api/v2/getQueueLength ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /firebase-messaging-sw.js — 2462 hits (0.8%)
export function get_firebase_messaging_sw_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/firebase-messaging-sw.js`, { headers })

  check(res, {
    '[cds] GET /firebase-messaging-sw.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/fcm/ — 2377 hits (0.7%)
export function post_api_v2_fcm(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/fcm/`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/fcm/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /dashboard/latest — 2280 hits (0.7%)
export function get_dashboard_latest(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/dashboard/latest`, { headers })

  check(res, {
    '[cds] GET /dashboard/latest ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/language — 1445 hits (0.4%)
export function get_api_v2_language(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/language`, { headers })

  check(res, {
    '[cds] GET /api/v2/language ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/tasks/v2 — 1424 hits (0.4%)
export function post_webviewer_api_v2_tasks_v2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/tasks/v2`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/tasks/v2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/tasks/count — 1337 hits (0.4%)
export function post_webviewer_api_v2_tasks_count(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/tasks/count`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/tasks/count ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/viewer2B/configs/3.0 — 1111 hits (0.3%)
export function get_api_v2_viewer2B_configs_3_0(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/viewer2B/configs/3.0`, { headers })

  check(res, {
    '[cds] GET /api/v2/viewer2B/configs/3.0 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/getSearchList — 664 hits (0.2%)
export function post_api_v2_getSearchList(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/getSearchList`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/getSearchList ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/task/{id}/users — 622 hits (0.2%)
export function get_api_v2_task__id__users(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/task/{id}/users`, { headers })

  check(res, {
    '[cds] GET /api/v2/task/{id}/users ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/viewer/criticaltokens/3.0 — 586 hits (0.2%)
export function get_webviewer_api_v2_viewer_criticaltokens_3_0(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/viewer/criticaltokens/3.0`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/viewer/criticaltokens/3.0 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/viewer/statements/3.0 — 586 hits (0.2%)
export function get_webviewer_api_v2_viewer_statements_3_0(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/viewer/statements/3.0`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/viewer/statements/3.0 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/tasks/{id}/algo — 483 hits (0.1%)
export function get_webviewer_api_v2_tasks__id__algo(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/tasks/{id}/algo`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/tasks/{id}/algo ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/tasks/{id}/v2/ — 450 hits (0.1%)
export function get_webviewer_api_v2_tasks__id__v2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/tasks/{id}/v2/`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/tasks/{id}/v2/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/capture-event — 403 hits (0.1%)
export function post_api_v2_capture_event(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/capture-event`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/capture-event ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/case/{id}/stage — 361 hits (0.1%)
export function post_api_v2_case__id__stage(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/case/{id}/stage`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/case/{id}/stage ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/task/assign — 357 hits (0.1%)
export function post_api_v2_task_assign(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/task/assign`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/task/assign ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/ecg/reports/{id} — 340 hits (0.1%)
export function get_api_v2_ecg_reports__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/ecg/reports/{id}`, { headers })

  check(res, {
    '[cds] GET /api/v2/ecg/reports/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /dashboard/cases — 322 hits (0.1%)
export function get_dashboard_cases(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/dashboard/cases`, { headers })

  check(res, {
    '[cds] GET /dashboard/cases ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/tasks/view/read — 317 hits (0.1%)
export function post_webviewer_api_v2_tasks_view_read(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/tasks/view/read`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/tasks/view/read ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// PUT /webviewer/api/v2/tasks/{id}/diagnose/v2 — 314 hits (0.1%)
export function put_webviewer_api_v2_tasks__id__diagnose_v2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.put(`${BASE_URL}/webviewer/api/v2/tasks/{id}/diagnose/v2`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] PUT /webviewer/api/v2/tasks/{id}/diagnose/v2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /Alert.8d1fe985c26334aab98f.js — 312 hits (0.1%)
export function get_Alert_8d1fe985c26334aab98f_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/Alert.8d1fe985c26334aab98f.js`, { headers })

  check(res, {
    '[cds] GET /Alert.8d1fe985c26334aab98f.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /16.fd16fd16e345e709b615.js — 307 hits (0.1%)
export function get_16_fd16fd16e345e709b615_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/16.fd16fd16e345e709b615.js`, { headers })

  check(res, {
    '[cds] GET /16.fd16fd16e345e709b615.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /4743c758a952f2bd4a35d4e42afc002b.woff2 — 302 hits (0.1%)
export function get_4743c758a952f2bd4a35d4e42afc002b_woff2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/4743c758a952f2bd4a35d4e42afc002b.woff2`, { headers })

  check(res, {
    '[cds] GET /4743c758a952f2bd4a35d4e42afc002b.woff2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /vendors~index.a840a25741e8ada6a014.js — 297 hits (0.1%)
export function get_vendors_index_a840a25741e8ada6a014_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/vendors~index.a840a25741e8ada6a014.js`, { headers })

  check(res, {
    '[cds] GET /vendors~index.a840a25741e8ada6a014.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /0.6f2c23e881dc5ac7ebbc.js — 296 hits (0.1%)
export function get_0_6f2c23e881dc5ac7ebbc_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/0.6f2c23e881dc5ac7ebbc.js`, { headers })

  check(res, {
    '[cds] GET /0.6f2c23e881dc5ac7ebbc.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /vendors~InitialComponent.387e2c797db62ce503b0.js — 296 hits (0.1%)
export function get_vendors_InitialComponent_387e2c797db62ce503b0_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/vendors~InitialComponent.387e2c797db62ce503b0.js`, { headers })

  check(res, {
    '[cds] GET /vendors~InitialComponent.387e2c797db62ce503b0.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /index.d238320a8ae5563f6006.js — 296 hits (0.1%)
export function get_index_d238320a8ae5563f6006_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/index.d238320a8ae5563f6006.js`, { headers })

  check(res, {
    '[cds] GET /index.d238320a8ae5563f6006.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /1.f75ea2be2d61f57ab340.js — 296 hits (0.1%)
export function get_1_f75ea2be2d61f57ab340_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/1.f75ea2be2d61f57ab340.js`, { headers })

  check(res, {
    '[cds] GET /1.f75ea2be2d61f57ab340.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /InitialComponent.542a1003840352e2778f.js — 296 hits (0.1%)
export function get_InitialComponent_542a1003840352e2778f_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/InitialComponent.542a1003840352e2778f.js`, { headers })

  check(res, {
    '[cds] GET /InitialComponent.542a1003840352e2778f.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /af7ae505a9eed503f8b8e6982036873e.woff2 — 295 hits (0.1%)
export function get_af7ae505a9eed503f8b8e6982036873e_woff2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/af7ae505a9eed503f8b8e6982036873e.woff2`, { headers })

  check(res, {
    '[cds] GET /af7ae505a9eed503f8b8e6982036873e.woff2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /dashboard/undiagnosed — 272 hits (0.1%)
export function get_dashboard_undiagnosed(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/dashboard/undiagnosed`, { headers })

  check(res, {
    '[cds] GET /dashboard/undiagnosed ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /2.ea15cc5999efd7d9cf3c.js — 244 hits (0.1%)
export function get_2_ea15cc5999efd7d9cf3c_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/2.ea15cc5999efd7d9cf3c.js`, { headers })

  check(res, {
    '[cds] GET /2.ea15cc5999efd7d9cf3c.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /5.8d3323411c1c6c5c7a57.js — 234 hits (0.1%)
export function get_5_8d3323411c1c6c5c7a57_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/5.8d3323411c1c6c5c7a57.js`, { headers })

  check(res, {
    '[cds] GET /5.8d3323411c1c6c5c7a57.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/algo-retry/{id}/check — 215 hits (0.1%)
export function get_api_v2_algo_retry__id__check(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/algo-retry/{id}/check`, { headers })

  check(res, {
    '[cds] GET /api/v2/algo-retry/{id}/check ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /favicon.png — 199 hits (0.1%)
export function get_favicon_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/favicon.png`, { headers })

  check(res, {
    '[cds] GET /favicon.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/tasks/{id}/history — 191 hits (0.1%)
export function post_api_v2_tasks__id__history(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/tasks/{id}/history`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/tasks/{id}/history ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /12.1f04b3001e169157c46b.js — 190 hits (0.1%)
export function get_12_1f04b3001e169157c46b_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/12.1f04b3001e169157c46b.js`, { headers })

  check(res, {
    '[cds] GET /12.1f04b3001e169157c46b.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/task/assign — 183 hits (0.1%)
export function post_webviewer_api_v2_task_assign(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/task/assign`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/task/assign ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/tasks/{id}/v2 — 148 hits (0.0%)
export function get_webviewer_api_v2_tasks__id__v2(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/tasks/{id}/v2`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/tasks/{id}/v2 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/login — 94 hits (0.0%)
export function post_api_v2_login(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/login`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/login ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /1768de81fa3eef9da9ce4aedc029bc69.mp3 — 83 hits (0.0%)
export function get_1768de81fa3eef9da9ce4aedc029bc69_mp3(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/1768de81fa3eef9da9ce4aedc029bc69.mp3`, { headers })

  check(res, {
    '[cds] GET /1768de81fa3eef9da9ce4aedc029bc69.mp3 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /f8e71ad35962cfd3be1e52bf74de0d18.png — 81 hits (0.0%)
export function get_f8e71ad35962cfd3be1e52bf74de0d18_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/f8e71ad35962cfd3be1e52bf74de0d18.png`, { headers })

  check(res, {
    '[cds] GET /f8e71ad35962cfd3be1e52bf74de0d18.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /aa0ba04d7b5c534acbcf55de2dd51b85.png — 78 hits (0.0%)
export function get_aa0ba04d7b5c534acbcf55de2dd51b85_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/aa0ba04d7b5c534acbcf55de2dd51b85.png`, { headers })

  check(res, {
    '[cds] GET /aa0ba04d7b5c534acbcf55de2dd51b85.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /13.69dcf4b426feb1619a7d.js — 54 hits (0.0%)
export function get_13_69dcf4b426feb1619a7d_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/13.69dcf4b426feb1619a7d.js`, { headers })

  check(res, {
    '[cds] GET /13.69dcf4b426feb1619a7d.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/viewer2B/configs/3.d — 52 hits (0.0%)
export function get_api_v2_viewer2B_configs_3_d(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/viewer2B/configs/3.d`, { headers })

  check(res, {
    '[cds] GET /api/v2/viewer2B/configs/3.d ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/logout — 50 hits (0.0%)
export function post_api_v2_logout(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/logout`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/logout ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/ecg/prioritize/{id} — 34 hits (0.0%)
export function post_api_ecg_prioritize__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/ecg/prioritize/{id}`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/ecg/prioritize/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/config/ — 31 hits (0.0%)
export function get_webviewer_api_v2_config(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/config/`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/config/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// PUT /webviewer/api/v2/fcm — 28 hits (0.0%)
export function put_webviewer_api_v2_fcm(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.put(`${BASE_URL}/webviewer/api/v2/fcm`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] PUT /webviewer/api/v2/fcm ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /login — 18 hits (0.0%)
export function get_login(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/login`, { headers })

  check(res, {
    '[cds] GET /login ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/task/unassign — 16 hits (0.0%)
export function post_api_v2_task_unassign(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/task/unassign`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/task/unassign ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /vendors~ChangePasswordPage.ca05805818b6a6beb26c.js — 15 hits (0.0%)
export function get_vendors_ChangePasswordPage_ca05805818b6a6beb26c_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/vendors~ChangePasswordPage.ca05805818b6a6beb26c.js`, { headers })

  check(res, {
    '[cds] GET /vendors~ChangePasswordPage.ca05805818b6a6beb26c.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /ChangePasswordPage.b2f8920697d71d7d6dce.js — 14 hits (0.0%)
export function get_ChangePasswordPage_b2f8920697d71d7d6dce_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/ChangePasswordPage.b2f8920697d71d7d6dce.js`, { headers })

  check(res, {
    '[cds] GET /ChangePasswordPage.b2f8920697d71d7d6dce.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /0dc031155e8c95fde4674939ba283c7f.svg — 13 hits (0.0%)
export function get_0dc031155e8c95fde4674939ba283c7f_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/0dc031155e8c95fde4674939ba283c7f.svg`, { headers })

  check(res, {
    '[cds] GET /0dc031155e8c95fde4674939ba283c7f.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /39ab06550bfbe603e5fd499eb11e4124.svg — 13 hits (0.0%)
export function get_39ab06550bfbe603e5fd499eb11e4124_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/39ab06550bfbe603e5fd499eb11e4124.svg`, { headers })

  check(res, {
    '[cds] GET /39ab06550bfbe603e5fd499eb11e4124.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /webviewer/api/v2/config — 12 hits (0.0%)
export function get_webviewer_api_v2_config(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/webviewer/api/v2/config`, { headers })

  check(res, {
    '[cds] GET /webviewer/api/v2/config ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /4338a7e5b73ad6c637e9f5862d05afc1.svg — 11 hits (0.0%)
export function get_4338a7e5b73ad6c637e9f5862d05afc1_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/4338a7e5b73ad6c637e9f5862d05afc1.svg`, { headers })

  check(res, {
    '[cds] GET /4338a7e5b73ad6c637e9f5862d05afc1.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /bd3392e4012d71acb840fdac3a1316fb.svg — 11 hits (0.0%)
export function get_bd3392e4012d71acb840fdac3a1316fb_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/bd3392e4012d71acb840fdac3a1316fb.svg`, { headers })

  check(res, {
    '[cds] GET /bd3392e4012d71acb840fdac3a1316fb.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /f15f04a39bcc98752d0f87cb105c56ab.svg — 11 hits (0.0%)
export function get_f15f04a39bcc98752d0f87cb105c56ab_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/f15f04a39bcc98752d0f87cb105c56ab.svg`, { headers })

  check(res, {
    '[cds] GET /f15f04a39bcc98752d0f87cb105c56ab.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/skipecg — 10 hits (0.0%)
export function post_api_v2_skipecg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/skipecg`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/skipecg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// PUT /webviewer/api/v2/user/active/1 — 10 hits (0.0%)
export function put_webviewer_api_v2_user_active_1(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.put(`${BASE_URL}/webviewer/api/v2/user/active/1`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] PUT /webviewer/api/v2/user/active/1 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /7a96687b06bdc15390512d9f8e7ac322.svg — 10 hits (0.0%)
export function get_7a96687b06bdc15390512d9f8e7ac322_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/7a96687b06bdc15390512d9f8e7ac322.svg`, { headers })

  check(res, {
    '[cds] GET /7a96687b06bdc15390512d9f8e7ac322.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /02e6e268c71c6722d316248854a6a954.svg — 10 hits (0.0%)
export function get_02e6e268c71c6722d316248854a6a954_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/02e6e268c71c6722d316248854a6a954.svg`, { headers })

  check(res, {
    '[cds] GET /02e6e268c71c6722d316248854a6a954.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /9658870853ed4016f00968c347158777.svg — 9 hits (0.0%)
export function get_9658870853ed4016f00968c347158777_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/9658870853ed4016f00968c347158777.svg`, { headers })

  check(res, {
    '[cds] GET /9658870853ed4016f00968c347158777.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /3cfb220484fc8c23ee9fc3b69d5432d0.png — 8 hits (0.0%)
export function get_3cfb220484fc8c23ee9fc3b69d5432d0_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/3cfb220484fc8c23ee9fc3b69d5432d0.png`, { headers })

  check(res, {
    '[cds] GET /3cfb220484fc8c23ee9fc3b69d5432d0.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /error — 7 hits (0.0%)
export function get_error(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/error`, { headers })

  check(res, {
    '[cds] GET /error ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/tasks/users — 5 hits (0.0%)
export function post_webviewer_api_v2_tasks_users(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/tasks/users`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/tasks/users ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /6df7f2a098409a1a0bf5358264bed5c7.svg — 5 hits (0.0%)
export function get_6df7f2a098409a1a0bf5358264bed5c7_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/6df7f2a098409a1a0bf5358264bed5c7.svg`, { headers })

  check(res, {
    '[cds] GET /6df7f2a098409a1a0bf5358264bed5c7.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /d30c6762918fdefd958479122a5e528e.mp3 — 4 hits (0.0%)
export function get_d30c6762918fdefd958479122a5e528e_mp3(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/d30c6762918fdefd958479122a5e528e.mp3`, { headers })

  check(res, {
    '[cds] GET /d30c6762918fdefd958479122a5e528e.mp3 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/tasks/unassign — 3 hits (0.0%)
export function post_webviewer_api_v2_tasks_unassign(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/tasks/unassign`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/tasks/unassign ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/viewer2B/configs/ — 3 hits (0.0%)
export function get_api_v2_viewer2B_configs(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/viewer2B/configs/`, { headers })

  check(res, {
    '[cds] GET /api/v2/viewer2B/configs/ ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /apple-touch-icon.png — 3 hits (0.0%)
export function get_apple_touch_icon_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/apple-touch-icon.png`, { headers })

  check(res, {
    '[cds] GET /apple-touch-icon.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /apple-touch-icon-precomposed.png — 3 hits (0.0%)
export function get_apple_touch_icon_precomposed_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/apple-touch-icon-precomposed.png`, { headers })

  check(res, {
    '[cds] GET /apple-touch-icon-precomposed.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /aca1afc8487411477b2d6a4b0510bffd.svg — 2 hits (0.0%)
export function get_aca1afc8487411477b2d6a4b0510bffd_svg(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/aca1afc8487411477b2d6a4b0510bffd.svg`, { headers })

  check(res, {
    '[cds] GET /aca1afc8487411477b2d6a4b0510bffd.svg ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/unpark/{id} — 2 hits (0.0%)
export function post_api_v2_unpark__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/unpark/{id}`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/unpark/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /137cf3b3af2b57c98ba41e9cd8b98f16.png — 2 hits (0.0%)
export function get_137cf3b3af2b57c98ba41e9cd8b98f16_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/137cf3b3af2b57c98ba41e9cd8b98f16.png`, { headers })

  check(res, {
    '[cds] GET /137cf3b3af2b57c98ba41e9cd8b98f16.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// OPTIONS /api/v2/report/doctor/active — 2 hits (0.0%)
export function options_api_v2_report_doctor_active(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.options(`${BASE_URL}/api/v2/report/doctor/active`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] OPTIONS /api/v2/report/doctor/active ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /63f75f6937ccf69232c045344f07ded4.png — 2 hits (0.0%)
export function get_63f75f6937ccf69232c045344f07ded4_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/63f75f6937ccf69232c045344f07ded4.png`, { headers })

  check(res, {
    '[cds] GET /63f75f6937ccf69232c045344f07ded4.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/centerList/v3 — 2 hits (0.0%)
export function post_webviewer_api_v2_centerList_v3(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/centerList/v3`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/centerList/v3 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/live-stats/3 — 2 hits (0.0%)
export function get_api_v2_live_stats_3(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/live-stats/3`, { headers })

  check(res, {
    '[cds] GET /api/v2/live-stats/3 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// PUT /api/v2/user/preferences/copyAlgoMeasurementsToMac — 1 hits (0.0%)
export function put_api_v2_user_preferences_copyAlgoMeasurementsToMac(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.put(`${BASE_URL}/api/v2/user/preferences/copyAlgoMeasurementsToMac`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] PUT /api/v2/user/preferences/copyAlgoMeasurementsToMac ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// OPTIONS /api/v2/report/total/eta — 1 hits (0.0%)
export function options_api_v2_report_total_eta(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.options(`${BASE_URL}/api/v2/report/total/eta`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] OPTIONS /api/v2/report/total/eta ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /errorPage.18223b18765e861292da.js — 1 hits (0.0%)
export function get_errorPage_18223b18765e861292da_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/errorPage.18223b18765e861292da.js`, { headers })

  check(res, {
    '[cds] GET /errorPage.18223b18765e861292da.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /41befd5e1ed08ea51554b1a25aa647c9.png — 1 hits (0.0%)
export function get_41befd5e1ed08ea51554b1a25aa647c9_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/41befd5e1ed08ea51554b1a25aa647c9.png`, { headers })

  check(res, {
    '[cds] GET /41befd5e1ed08ea51554b1a25aa647c9.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/verify/token/{id}{id}9a6f77f301210024d06f9aaa8aa6 — 1 hits (0.0%)
export function get_api_v2_verify_token__id__id_9a6f77f301210024d06f9aaa8aa6(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/verify/token/{id}{id}9a6f77f301210024d06f9aaa8aa6`, { headers })

  check(res, {
    '[cds] GET /api/v2/verify/token/{id}{id}9a6f77f301210024d06f9aaa8aa6 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// PUT /webviewer/api/v2/user/active/0 — 1 hits (0.0%)
export function put_webviewer_api_v2_user_active_0(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.put(`${BASE_URL}/webviewer/api/v2/user/active/0`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] PUT /webviewer/api/v2/user/active/0 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/login — 1 hits (0.0%)
export function post_webviewer_api_v2_login(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/login`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/login ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// OPTIONS /api/v2/user — 1 hits (0.0%)
export function options_api_v2_user(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.options(`${BASE_URL}/api/v2/user`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] OPTIONS /api/v2/user ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/password/forgot — 1 hits (0.0%)
export function post_api_v2_password_forgot(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/password/forgot`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/password/forgot ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /robots.txt — 1 hits (0.0%)
export function get_robots_txt(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/robots.txt`, { headers })

  check(res, {
    '[cds] GET /robots.txt ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /Loading — 1 hits (0.0%)
export function get_Loading(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/Loading`, { headers })

  check(res, {
    '[cds] GET /Loading ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /fee66e712a8a08eef5805a46892932ad.woff — 1 hits (0.0%)
export function get_fee66e712a8a08eef5805a46892932ad_woff(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/fee66e712a8a08eef5805a46892932ad.woff`, { headers })

  check(res, {
    '[cds] GET /fee66e712a8a08eef5805a46892932ad.woff ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /webviewer/api/v2/patientList/v3 — 1 hits (0.0%)
export function post_webviewer_api_v2_patientList_v3(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/webviewer/api/v2/patientList/v3`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /webviewer/api/v2/patientList/v3 ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// HEAD /forgotpassword — 0 hits (0.0%)
export function head_forgotpassword(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.head(`${BASE_URL}/forgotpassword`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] HEAD /forgotpassword ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// HEAD /dashboard/cases — 0 hits (0.0%)
export function head_dashboard_cases(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.head(`${BASE_URL}/dashboard/cases`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] HEAD /dashboard/cases ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/login-logs — 0 hits (0.0%)
export function get_api_v2_login_logs(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/login-logs`, { headers })

  check(res, {
    '[cds] GET /api/v2/login-logs ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// OPTIONS /api/v2/language — 0 hits (0.0%)
export function options_api_v2_language(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.options(`${BASE_URL}/api/v2/language`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] OPTIONS /api/v2/language ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /14.29b4c4afc09e0fe6b532.js — 0 hits (0.0%)
export function get_14_29b4c4afc09e0fe6b532_js(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/14.29b4c4afc09e0fe6b532.js`, { headers })

  check(res, {
    '[cds] GET /14.29b4c4afc09e0fe6b532.js ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /4db35287e5e52cc14cf802a73ce38d1b.png — 0 hits (0.0%)
export function get_4db35287e5e52cc14cf802a73ce38d1b_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/4db35287e5e52cc14cf802a73ce38d1b.png`, { headers })

  check(res, {
    '[cds] GET /4db35287e5e52cc14cf802a73ce38d1b.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /api/v2/verify/token/{id} — 0 hits (0.0%)
export function get_api_v2_verify_token__id_(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/api/v2/verify/token/{id}`, { headers })

  check(res, {
    '[cds] GET /api/v2/verify/token/{id} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /eb15d6afcac523ecf20b530e713c2c6c.png — 0 hits (0.0%)
export function get_eb15d6afcac523ecf20b530e713c2c6c_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/eb15d6afcac523ecf20b530e713c2c6c.png`, { headers })

  check(res, {
    '[cds] GET /eb15d6afcac523ecf20b530e713c2c6c.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /password/new — 0 hits (0.0%)
export function get_password_new(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/password/new`, { headers })

  check(res, {
    '[cds] GET /password/new ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /a64e47e0f0c6e52d9cc00bdd0c606958.png — 0 hits (0.0%)
export function get_a64e47e0f0c6e52d9cc00bdd0c606958_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/a64e47e0f0c6e52d9cc00bdd0c606958.png`, { headers })

  check(res, {
    '[cds] GET /a64e47e0f0c6e52d9cc00bdd0c606958.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// POST /api/v2/password/update — 0 hits (0.0%)
export function post_api_v2_password_update(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.post(`${BASE_URL}/api/v2/password/update`, JSON.stringify({}), { headers })

  check(res, {
    '[cds] POST /api/v2/password/update ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}

// GET /537c970194e2c56d930641d27cd517ad.png — 0 hits (0.0%)
export function get_537c970194e2c56d930641d27cd517ad_png(data) {
  const headers = {
    ...AUTH_HEADERS,
    'token': data.token,
  }

  const res = http.get(`${BASE_URL}/537c970194e2c56d930641d27cd517ad.png`, { headers })

  check(res, {
    '[cds] GET /537c970194e2c56d930641d27cd517ad.png ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}
