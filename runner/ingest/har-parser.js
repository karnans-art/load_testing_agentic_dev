// Runner — HAR File Parser
// Reads HAR file and extracts real request payloads per endpoint
// Fills gaps that WAF logs don't provide (exact bodies, query params, headers)

import fs from 'fs'

/**
 * Parse HAR file and return map of endpoint → payload details
 * @param {string} filePath - Path to .har file
 * @param {string} baseUrl - App base URL to filter relevant entries
 */
export function parseHAR(filePath, baseUrl) {
  if (!fs.existsSync(filePath)) {
    return {
      available: false,
      warning: `HAR file not found at ${filePath}. Proceeding without HAR data. Request payloads will be discovered from live API calls.`,
      entries: {},
    }
  }

  const har = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const entries = har.log?.entries || []

  const endpointMap = {}

  entries.forEach(entry => {
    const req = entry.request
    if (!req) return

    // Filter to app-specific URLs only
    if (baseUrl && !req.url.includes(new URL(baseUrl).hostname)) return

    let pathname
    try {
      pathname = new URL(req.url).pathname
    } catch {
      return
    }

    const key = `${req.method.toUpperCase()}:${pathname}`

    // Only store the FIRST capture per endpoint (most representative)
    if (endpointMap[key]) return

    // Extract query params
    const queryParams = {}
    try {
      const url = new URL(req.url)
      url.searchParams.forEach((v, k) => { queryParams[k] = v })
    } catch {}

    // Extract request body
    let body = null
    if (req.postData?.text) {
      try {
        body = JSON.parse(req.postData.text)
      } catch {
        body = req.postData.text
      }
    }

    // Extract relevant headers (exclude auth — will be replaced at runtime)
    const headers = {}
    const skipHeaders = ['authorization', 'cookie', 'host', 'content-length']
    req.headers?.forEach(h => {
      if (!skipHeaders.includes(h.name.toLowerCase())) {
        headers[h.name] = h.value
      }
    })

    endpointMap[key] = {
      method: req.method.toUpperCase(),
      pathname,
      url: req.url,
      body,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : null,
      headers,
      responseStatus: entry.response?.status,
      harConfirmed: true,
    }
  })

  return {
    available: true,
    entryCount: Object.keys(endpointMap).length,
    entries: endpointMap,
  }
}

/**
 * Merge WAF profile with HAR data
 * HAR wins for payload details. WAF wins for hit counts.
 */
export function mergeWAFandHAR(wafProfile, harData) {
  const merged = wafProfile.endpoints.map(endpoint => {
    const key = `${endpoint.method}:${endpoint.uri}`
    const harEntry = harData.entries[key]

    if (harEntry) {
      return {
        ...endpoint,
        harConfirmed: true,
        body: harEntry.body,
        queryParams: harEntry.queryParams,
        capturedHeaders: harEntry.headers,
        // Override include decision — HAR confirmation overrides null agent uncertainty
        include: true,
        includeReason: endpoint.includeReason === 'INCLUDE_NULL_AGENT_UNCERTAIN'
          ? 'INCLUDE_HAR_CONFIRMED'
          : endpoint.includeReason,
        confidence: Math.max(endpoint.confidence || 0, 95),
      }
    }

    return { ...endpoint, harConfirmed: false }
  })

  return { ...wafProfile, endpoints: merged }
}
