// Runner — API Discoverer
// Hits real API endpoints to capture live request/response shapes
// Run ONCE per app — saves to apps/<name>/discovered/endpoints.json

import http from 'k6/http'

/**
 * Called from a k6 setup() context.
 * Logs in, then probes each endpoint from the traffic profile.
 * Returns discovered payload map.
 */
export function discoverEndpoints(baseUrl, credentials, loginConfig, endpoints) {
  const results = {}
  const warnings = []

  // Step 1: Login
  const loginRes = http.post(
    `${baseUrl}${loginConfig.endpoint}`,
    JSON.stringify({
      [loginConfig.usernameField]: credentials.email,
      [loginConfig.passwordField]: credentials.password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }
  )

  if (loginRes.status !== 200) {
    warnings.push(`Login failed with status ${loginRes.status} — cannot discover protected endpoints`)
    return { results, warnings, token: null }
  }

  const token = loginRes.json(loginConfig.tokenPath)
  if (!token) {
    warnings.push(`Login succeeded but no token found at response.${loginConfig.tokenPath}`)
    return { results, warnings, token: null }
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  // Step 2: Probe each HTTP endpoint
  endpoints
    .filter(e => e.include && e.type === 'HTTP')
    .forEach(endpoint => {
      const key = `${endpoint.method}:${endpoint.uri}`
      let res

      try {
        if (endpoint.method === 'GET') {
          const url = endpoint.queryParams
            ? `${baseUrl}${endpoint.uri}?${new URLSearchParams(endpoint.queryParams)}`
            : `${baseUrl}${endpoint.uri}`
          res = http.get(url, { headers: authHeaders })
        } else {
          // For POST/PUT/PATCH — use HAR body if available, else send empty object
          const body = endpoint.body ? JSON.stringify(endpoint.body) : '{}'
          res = http.request(endpoint.method, `${baseUrl}${endpoint.uri}`, body, { headers: authHeaders })
        }

        results[key] = {
          method: endpoint.method,
          uri: endpoint.uri,
          responseStatus: res.status,
          responseTime: res.timings.duration,
          // Capture response shape for understanding (not for assertions)
          responseSample: safeParseJson(res.body)?.slice
            ? safeParseJson(res.body)
            : null,
        }
      } catch (e) {
        warnings.push(`Failed to probe ${key}: ${e.message}`)
      }
    })

  return { results, warnings, token }
}

function safeParseJson(body) {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}
