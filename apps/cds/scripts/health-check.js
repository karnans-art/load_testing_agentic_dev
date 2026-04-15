// CDS — Health Check
// 1 VU, 1 iteration — login + core endpoints. Fast CI gate (~5s).
// Run: npm run health:cds

import http from 'k6/http'
import { check } from 'k6'
import { authHeaders, isLoggedIn, getUser, getBaseUrl } from './lib/cds-auth.js'
import { loginDuration, apiSuccessRate } from './lib/cds-metrics.js'

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks:            ['rate>0.99'],
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
}

export default function () {
  const loginStart = Date.now()
  const h = authHeaders()
  loginDuration.add(Date.now() - loginStart)

  if (!isLoggedIn()) {
    console.error('Health check FAILED — login failed')
    return
  }

  const BASE_URL = getBaseUrl()
  const user = getUser()

  const endpoints = [
    { name: 'config',                url: `${BASE_URL}/api/v2/config` },
    { name: 'config/version/viewer', url: `${BASE_URL}/api/v2/config/version/viewer` },
    { name: 'language',              url: `${BASE_URL}/api/v2/language` },
    { name: 'user',                  url: `${BASE_URL}/api/v2/user` },
    { name: 'getQueueLength',        url: `${BASE_URL}/api/v2/getQueueLength` },
    { name: 'report/total/eta',      url: `${BASE_URL}/api/v2/report/total/eta` },
  ]

  endpoints.forEach(({ name, url }) => {
    const res = http.get(url, { headers: h, tags: { name } })
    const ok = check(res, { [`${name} ok`]: (r) => r.status === 200 })
    apiSuccessRate.add(ok ? 1 : 0)
  })

  console.log(`Health check passed — doctor: ${user.doctorName}`)
}

export function setup() {
  console.log('Running CDS health check...')
}
