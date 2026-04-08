// Runner — WAF Log Parser
// Reads WAF log Excel file and outputs endpoint traffic profile
// Supports multi-sheet Excel (one sheet per day/domain)
// Used by all apps — app-specific data passed as arguments

import XLSX from 'xlsx'
import path from 'path'

// Skip these — confirmed non-human automated agents
const BOT_AGENTS = [
  'amazon simple notification service',  // AWS SNS internal webhooks — NOT user traffic
  'googlebot', 'google-read-aloud', 'googleassociationservice', 'google-apps-script',
  'gatus',                               // uptime monitoring tool
  'slackbot', 'slackbot-linkexpanding',
  'instatusbot',
  'dataforseobot', 'proximic',
  'palo alto networks',
  'chrome privacy preserving prefetch proxy',
  'test certificate info',
  'python-requests',
  'go-http-client',
  'scrapy', 'wget',
]

// Confirmed human browser / real app agents — ALWAYS include
const HUMAN_AGENTS = [
  'mozilla',   // covers Chrome, Firefox, Safari, Edge, Opera, Samsung, mobile browsers
  'okhttp',    // Android HTTP client — real mobile app user traffic
  'opera',
]

const SKIP_URI_PATTERNS = [
  '/health', '/ping', '/metrics', '/internal',
  '/favicon', '/.well-known', '/static/', '/assets/',
]

// Domain → app name mapping (for multi-sheet WAF files)
export const DOMAIN_TO_APP = {
  'ecg.tricog.com':      'cds',
  'admin.tricog.com':    'admin',
  'customer.tricog.com': 'customer',
}

/**
 * Parse WAF Excel file and return endpoint traffic profile
 * @param {string} filePath   - Path to WAF Excel file
 * @param {number} timeWindowHours - Time window per sheet in hours (default 24)
 * @param {string} domainFilter    - Filter sheets by domain keyword e.g. 'ecg', 'admin', 'customer'
 */
export function parseWAF(filePath, timeWindowHours = 24, domainFilter = null) {
  const wb = XLSX.readFile(filePath)

  // Select sheets matching the domain filter
  const targetSheets = domainFilter
    ? wb.SheetNames.filter(s => s.toLowerCase().includes(domainFilter.toLowerCase()))
    : [wb.SheetNames[0]]

  if (targetSheets.length === 0) {
    throw new Error(`No sheets found matching domain filter "${domainFilter}". Available: ${wb.SheetNames.join(', ')}`)
  }

  console.log(`  Sheets: ${targetSheets.join(' | ')}`)

  // Aggregate hits across all matching sheets
  // Each sheet = 1 day → we average to get daily rate
  const endpointMap = {}

  targetSheets.forEach(sheetName => {
    const ws = wb.Sheets[sheetName]
    const sheetRows = XLSX.utils.sheet_to_json(ws)
    sheetRows.forEach(r => {
      const method = (r.method || r.Method || '').toUpperCase().trim()
      const uri = (r.normalized_uri || r.uri || r.URI || '').trim()
      const hits = parseInt(r.hits || r.Hits || 0)
      const userAgent = (r.user_agent || r.user_Agent || null)

      if (!method || !uri || isNaN(hits) || hits <= 0) return

      const key = `${method}:${uri}`
      if (!endpointMap[key]) {
        endpointMap[key] = { method, uri, totalHits: 0, agents: new Set() }
      }
      endpointMap[key].totalHits += hits
      if (userAgent) endpointMap[key].agents.add(userAgent)
    })
  })

  const numDays = targetSheets.length
  const timeWindowSeconds = timeWindowHours * 3600

  // Convert to array with daily-averaged hits
  const endpoints = Object.values(endpointMap).map(e => {
    const dailyHits = Math.round(e.totalHits / numDays)
    const agentsArr = [...e.agents]

    const decision = classifyEndpoint(e.method, e.uri, agentsArr, dailyHits)

    return {
      method: e.method,
      uri: e.uri,
      hits: dailyHits,
      rawHitsTotal: e.totalHits,
      daysAggregated: numDays,
      hitPercentage: 0,               // filled after total calc
      hitsPerSecond: dailyHits / timeWindowSeconds,
      hitsPerMinute: (dailyHits / timeWindowSeconds) * 60,
      type: e.uri.includes('socket.io') ? 'WEBSOCKET' : 'HTTP',
      priority: 'MEDIUM',             // filled after sort
      agents: agentsArr,
      ...decision,
    }
  })

  // Calculate total hits and percentages
  const totalHits = endpoints.reduce((s, e) => s + e.hits, 0)
  endpoints.forEach(e => {
    e.hitPercentage = ((e.hits / totalHits) * 100).toFixed(1)
  })

  // Sort by hits descending, assign priority tiers
  endpoints.sort((a, b) => b.hits - a.hits)
  const n = endpoints.length
  endpoints.forEach((e, i) => {
    if (i < n * 0.2)      e.priority = 'CRITICAL'
    else if (i < n * 0.5) e.priority = 'HIGH'
    else if (i < n * 0.8) e.priority = 'MEDIUM'
    else                  e.priority = 'LOW'
  })

  const includedEndpoints = endpoints.filter(e => e.include)
  const skippedEndpoints  = endpoints.filter(e => !e.include)

  return {
    metadata: {
      totalHits,
      numDays,
      timeWindowHours,
      sourceFile: path.basename(filePath),
      sheets: targetSheets,
      parsedAt: new Date().toISOString(),
      endpointCount: endpoints.length,
      includedCount: includedEndpoints.length,
      skippedCount: skippedEndpoints.length,
    },
    endpoints,
  }
}

/**
 * Classify an endpoint: include or skip, with reason and confidence
 */
function classifyEndpoint(method, uri, agents, hits) {
  // Check all agents for this endpoint (may have multiple)
  for (const agent of agents) {
    const ua = agent.toLowerCase()

    // Confirmed bot/system → skip
    if (BOT_AGENTS.some(b => ua.includes(b))) {
      return {
        include: false,
        includeReason: 'SKIP_BOT_AGENT',
        confidence: 97,
        agentClass: 'BOT',
        warning: null,
      }
    }

    // Confirmed human browser / mobile app → include immediately
    if (HUMAN_AGENTS.some(h => ua.includes(h))) {
      return {
        include: true,
        includeReason: 'CONFIRMED_HUMAN_AGENT',
        confidence: 99,
        agentClass: ua.includes('okhttp') ? 'ANDROID_APP' : 'BROWSER',
        warning: null,
      }
    }

    // Axios/python that's NOT confirmed in HAR — skip
    if (ua.includes('axios/') || ua.includes('python-requests')) {
      return {
        include: false,
        includeReason: 'SKIP_SCRIPT_AGENT',
        confidence: 92,
        agentClass: 'SCRIPT',
        warning: null,
      }
    }
  }

  // Infrastructure URIs → skip regardless of agent
  if (SKIP_URI_PATTERNS.some(p => uri.toLowerCase().includes(p)) && hits < 100) {
    return {
      include: false,
      includeReason: 'SKIP_INFRASTRUCTURE_URI',
      confidence: 90,
      agentClass: 'INFRA',
      warning: null,
    }
  }

  // null/empty agents — evaluate by context
  const isBusinessUri = !SKIP_URI_PATTERNS.some(p => uri.toLowerCase().includes(p))
  const isWriteMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)
  const isSocketIO = uri.includes('socket.io')

  if (hits > 5000 && isBusinessUri) {
    return {
      include: true,
      includeReason: 'INCLUDE_NULL_AGENT_HIGH_VOLUME',
      confidence: 88,
      agentClass: 'NULL_AGENT',
      warning: `null user_agent but ${hits.toLocaleString()} daily hits — likely mobile app or privacy browser`,
    }
  }

  if (isWriteMethod && isBusinessUri && hits > 500) {
    return {
      include: true,
      includeReason: 'INCLUDE_NULL_AGENT_WRITE_METHOD',
      confidence: 82,
      agentClass: 'NULL_AGENT',
      warning: `null user_agent on ${method} with ${hits.toLocaleString()} hits — likely real user action`,
    }
  }

  if (isSocketIO) {
    return {
      include: true,
      includeReason: 'INCLUDE_WEBSOCKET_NULL_AGENT',
      confidence: 85,
      agentClass: 'NULL_AGENT',
      warning: `WebSocket endpoint with null agent — included for load test (use Artillery for WS load)`,
    }
  }

  if (hits < 50 && !isBusinessUri) {
    return {
      include: false,
      includeReason: 'SKIP_LOW_HIT_INFRA',
      confidence: 85,
      agentClass: 'NULL_AGENT',
      warning: null,
    }
  }

  // Default — include with warning for manual review
  return {
    include: true,
    includeReason: 'INCLUDE_UNCERTAIN',
    confidence: 65,
    agentClass: 'NULL_AGENT',
    warning: `Uncertain classification — ${hits.toLocaleString()} hits, no user_agent. Please verify.`,
  }
}
