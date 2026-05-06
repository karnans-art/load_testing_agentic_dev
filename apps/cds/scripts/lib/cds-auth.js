// CDS — Shared Auth Module
// Per-VU login with auto-refresh on 401.
// Login → updateActive → GET /user (profile) — all once per VU.

import http from 'k6/http'
import { check } from 'k6'

const USERS = JSON.parse(open('../../users.json')).users

export const HEADERS = {
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

// VU-local state
let _token = null
let _vuUser = null

export function getUser() {
  if (!_vuUser) {
    const idx = __VU - 1
    if (idx >= USERS.length) return null  // no user for this VU — avoid session collision
    _vuUser = { ...USERS[idx] }
  }
  return _vuUser
}

if (!__ENV.BASE_URL) throw new Error('BASE_URL is not set — add it to .env before running tests')

export function getBaseUrl() {
  return __ENV.BASE_URL
}

export function doLogin() {
  const BASE_URL = getBaseUrl()
  const user = getUser()
  if (!user) return null  // no user for this VU
  const loginRes = http.post(
    `${BASE_URL}/api/v2/login`,
    JSON.stringify({
      domainId:    user.domainId,
      username:    user.username,
      password:    user.password,
      application: 'INSTA_ECG_VIEWER',
      appVersion:  '3.0.0',
    }),
    { headers: HEADERS }
  )
  check(loginRes, { 'login ok': (r) => r.status === 200 })
  const token = loginRes.json('token')
  if (!token) {
    console.error(`[VU${__VU}] Login failed: ${loginRes.status} — ${loginRes.body?.slice(0, 200)}`)
    return null
  }

  const authedHeaders = { ...HEADERS, 'token': token }

  // updateActive — mark doctor online
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 1, captureEvent: false }),
    { headers: authedHeaders }
  )

  // Fetch live doctor profile
  const profileRes = http.get(`${BASE_URL}/api/v2/user`, { headers: authedHeaders })
  const profile = profileRes.json()
  const doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || user.username

  _vuUser.doctorName = doctorName
  _token = token
  console.log(`[VU${__VU}] Logged in — doctor: ${doctorName} token: ${token.slice(0, 8)}…`)
  return token
}

export function authHeaders(forceRefresh = false) {
  if (!_token || forceRefresh) {
    doLogin()
  }
  return { ...HEADERS, 'token': _token }
}

export function isLoggedIn() {
  return _token !== null
}

export function doLogout() {
  if (!_token) return
  const BASE_URL = getBaseUrl()
  const h = { ...HEADERS, 'token': _token }

  // Mark doctor offline — releases Invoker stickiness
  http.post(`${BASE_URL}/api/v2/updateActive`,
    JSON.stringify({ isActive: 0, captureEvent: false }),
    { headers: h }
  )

  // Logout — invalidates token
  http.post(`${BASE_URL}/api/v2/logout`, JSON.stringify({ inactive: false }), { headers: h })

  console.log(`[VU${__VU}] Logged out`)
  _token = null
}
