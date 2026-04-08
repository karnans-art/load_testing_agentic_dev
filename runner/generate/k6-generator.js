// Runner — k6 Script Generator
// Takes merged traffic profile and generates rate-matched k6 scenarios
// Writes to apps/<name>/scripts/normal-load.js and peak-load.js

import fs from 'fs'
import path from 'path'

/**
 * Generate k6 normal-load script from traffic profile
 * @param {object} profile - Merged WAF+HAR traffic profile
 * @param {object} appConfig - App-level config (baseUrl, loginEndpoint, etc.)
 * @param {string} outputPath - Where to write the script
 */
export function generateNormalLoad(profile, appConfig, outputPath) {
  const included = profile.endpoints.filter(e => e.include && e.type === 'HTTP')

  const scenarioBlocks = included.map(e => {
    const fnName = toFunctionName(e.method, e.uri)
    const ratePerMin = Math.max(1, Math.round(e.hitsPerMinute))
    const preAllocVUs = Math.max(2, Math.ceil(ratePerMin / 5))

    return `
    // ${e.priority}: ${e.hits} hits → ${e.hitsPerMinute.toFixed(2)}/min
    ${fnName}: {
      executor: 'constant-arrival-rate',
      rate: ${ratePerMin},
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: ${preAllocVUs},
      maxVUs: ${preAllocVUs * 4},
      exec: '${fnName}',
      tags: { app: '${appConfig.appName}', endpoint: '${e.uri}', priority: '${e.priority}' },
    },`
  }).join('\n')

  const functionBlocks = included.map(e => {
    const fnName = toFunctionName(e.method, e.uri)
    return buildScenarioFunction(fnName, e, appConfig)
  }).join('\n\n')

  const script = `// ${appConfig.appName.toUpperCase()} — Normal Load Test (Production Replay)
// Generated: ${new Date().toISOString()}
// WAF source: ${profile.metadata.sourceFile}
// Total production hits analyzed: ${profile.metadata.totalHits.toLocaleString()}
// Time window: ${profile.metadata.timeWindowHours}h
// ⚠️  AUTO-GENERATED — regenerate with: node runner/run.js --app ${appConfig.appName} --step generate

import http from 'k6/http'
import { check } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || '${appConfig.baseUrl}'
const TEST_USERNAME = __ENV.TEST_USERNAME || ''
const TEST_PASSWORD = __ENV.TEST_PASSWORD || ''
const TEST_DOMAIN = __ENV.TEST_DOMAIN || ''

const AUTH_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json;charset=UTF-8',
  'appname': '${appConfig.appHeaderName || appConfig.appName.toUpperCase()}',
  'lang': 'en',
}

// ── Metrics ────────────────────────────────────────────────────
const errorRate = new Rate('${appConfig.appName}_errors')
const apiDuration = new Trend('${appConfig.appName}_api_duration', true)

// ── Traffic Profile Summary ────────────────────────────────────
${included.map(e => `// ${e.method.padEnd(6)} ${e.uri.padEnd(40)} ${String(e.hits).padStart(6)} hits  ${e.hitPercentage}%  ${e.priority}`).join('\n')}

// ── Scenarios ──────────────────────────────────────────────────
export const options = {
  scenarios: {${scenarioBlocks}
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    '${appConfig.appName}_errors': ['rate<0.05'],
  },
}

// ── Auth ───────────────────────────────────────────────────────
export function setup() {
  const res = http.post(
    \`\${BASE_URL}${appConfig.loginEndpoint}\`,
    JSON.stringify(${buildLoginBody(appConfig)}),
    { headers: AUTH_HEADERS }
  )
  check(res, { '[${appConfig.appName}] login ok': (r) => r.status === 200 })
  const token = res.json('${appConfig.tokenPath}')
${appConfig.postLoginStep ? buildPostLoginStep(appConfig) : ''}
  // Fetch live profile — payload fields (e.g. doctorName) come from the API response
  const profileRes = http.get(
    \`\${BASE_URL}/api/v2/user\`,
    { headers: { ...AUTH_HEADERS, '${appConfig.tokenHeader || 'Authorization'}': token } }
  )
  const profile = profileRes.json()
  const doctorName = (Array.isArray(profile) ? profile[0] : profile)?.loggedDoctor || TEST_USERNAME

  return { token, doctorName }
}

// ── Scenario Functions ──────────────────────────────────────────
${functionBlocks}
`

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, script)
  return { written: outputPath, scenarioCount: included.length }
}

function buildScenarioFunction(fnName, endpoint, appConfig) {
  const url = endpoint.queryParams
    ? `\`\${BASE_URL}${endpoint.uri}?${buildQueryString(endpoint.queryParams)}\``
    : `\`\${BASE_URL}${endpoint.uri}\``

  const bodyLine = endpoint.body
    ? `JSON.stringify(${JSON.stringify(endpoint.body, null, 6)})`
    : endpoint.method !== 'GET' ? 'JSON.stringify({})' : null

  const httpCall = endpoint.method === 'GET'
    ? `http.get(${url}, { headers })`
    : `http.${endpoint.method.toLowerCase()}(${url}, ${bodyLine}, { headers })`

  return `// ${endpoint.method} ${endpoint.uri} — ${endpoint.hits} hits (${endpoint.hitPercentage}%)
export function ${fnName}(data) {
  const headers = {
    ...AUTH_HEADERS,
    '${appConfig.tokenHeader || 'Authorization'}': ${appConfig.tokenHeader ? `data.token` : `\`Bearer \${data.token}\``},
  }

  const res = ${httpCall}

  check(res, {
    '[${appConfig.appName}] ${endpoint.method} ${endpoint.uri} ok': (r) => r.status >= 200 && r.status < 300,
  })

  errorRate.add(res.status >= 400)
  apiDuration.add(res.timings.duration)
}`
}

function toFunctionName(method, uri) {
  const parts = uri
    .split('/')
    .filter(Boolean)
    .map(p => p.replace(/[^a-zA-Z0-9]/g, '_'))
    .join('_')
  return `${method.toLowerCase()}_${parts}`
}

function buildQueryString(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

/**
 * Build the post-login step (e.g. updateActive for CDS).
 * Emitted inside setup() after login, using the fresh token.
 */
function buildPostLoginStep(appConfig) {
  const { endpoint, body } = appConfig.postLoginStep
  const tokenHeader = appConfig.tokenHeader || 'Authorization'
  return `  // Post-login: ${endpoint}
  http.post(
    \`\${BASE_URL}${endpoint}\`,
    JSON.stringify(${JSON.stringify(body)}),
    { headers: { ...AUTH_HEADERS, '${tokenHeader}': token } }
  )`
}

/**
 * Build login body string for the generated script.
 * If appConfig.loginBody is provided (e.g. CDS with domainId/application/appVersion),
 * use it directly with env-var substitutions for username/password.
 * Otherwise fall back to simple username/password fields.
 */
function buildLoginBody(appConfig) {
  if (appConfig.loginBody) {
    // Replace username/password values with env var references
    const body = { ...appConfig.loginBody }
    const usernameKey = appConfig.usernameField || 'username'
    const passwordKey = appConfig.passwordField || 'password'
    // We emit JS expression, not a JSON literal — use template substitution
    const entries = Object.entries(body).map(([k, v]) => {
      if (k === usernameKey) return `  ${k}: TEST_USERNAME`
      if (k === passwordKey) return `  ${k}: TEST_PASSWORD`
      if (k === (appConfig.domainField || 'domainId')) return `  ${k}: TEST_DOMAIN`
      return `  ${k}: ${JSON.stringify(v)}`
    })
    return `{\n${entries.join(',\n')}\n}`
  }
  const u = appConfig.usernameField || 'username'
  const p = appConfig.passwordField || 'password'
  return `{ ${u}: TEST_USERNAME, ${p}: TEST_PASSWORD }`
}
