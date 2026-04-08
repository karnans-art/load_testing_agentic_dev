#!/usr/bin/env node
// Runner — Master Orchestrator
// Usage:
//   node runner/run.js --app cds                          # full pipeline
//   node runner/run.js --app cds --step ingest            # parse WAF + HAR only
//   node runner/run.js --app cds --step generate          # regenerate k6 scripts
//   node runner/run.js --app cds --step run               # run k6 local
//   node runner/run.js --app cds --step run --mode cloud  # run k6 cloud

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { parseArgs } from 'util'
import { parseWAF } from './ingest/waf-parser.js'
import { parseHAR, mergeWAFandHAR } from './ingest/har-parser.js'
import { generateNormalLoad } from './generate/k6-generator.js'

const { values: args } = parseArgs({
  options: {
    app:      { type: 'string' },
    step:     { type: 'string', default: 'all' },
    mode:     { type: 'string', default: 'local' },
    duration: { type: 'string', default: '10m' },
    scenario: { type: 'string', default: 'normal' },
    window:   { type: 'string', default: '24' },        // WAF time window in hours
  },
})

if (!args.app) {
  console.error('Error: --app is required. Example: node runner/run.js --app cds')
  process.exit(1)
}

const APP = args.app
const APP_DIR = path.resolve(`apps/${APP}`)
const DISCOVERED_DIR = path.join(APP_DIR, 'discovered')
const WAF_DIR = path.join(APP_DIR, 'waf-logs')
const HAR_DIR = path.join(APP_DIR, 'har-files')
const SCRIPTS_DIR = path.join(APP_DIR, 'scripts')
const REPORTS_DIR = path.join(APP_DIR, 'reports')

if (!fs.existsSync(APP_DIR)) {
  console.error(`Error: App "${APP}" not found at ${APP_DIR}`)
  console.error('Available apps:', fs.readdirSync('apps').join(', '))
  process.exit(1)
}

// Load app config
const appConfig = await loadAppConfig(APP, APP_DIR)

const step = args.step

if (step === 'all' || step === 'ingest') {
  await runIngest()
}

if (step === 'all' || step === 'generate') {
  await runGenerate()
}

if (step === 'all' || step === 'run') {
  await runTests()
}

// ── Steps ───────────────────────────────────────────────────────

async function runIngest() {
  console.log(`\n[${APP}] STEP 1: Ingesting WAF + HAR data...`)

  // Find WAF file
  const wafFiles = fs.readdirSync(WAF_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
  if (wafFiles.length === 0) {
    console.error(`\n  ⚠️  No WAF Excel file found in ${WAF_DIR}`)
    console.error(`  Drop your WAF .xlsx file into ${WAF_DIR}/ and rerun.\n`)
    process.exit(1)
  }
  const wafFile = path.join(WAF_DIR, wafFiles[0])
  console.log(`  WAF file: ${wafFiles[0]}`)

  // Parse WAF — filter sheets by domain (e.g. 'ecg' matches '15th march ecg.tricog.com')
  const wafProfile = parseWAF(wafFile, parseInt(args.window), appConfig.wafDomainFilter)
  console.log(`  Endpoints found: ${wafProfile.metadata.endpointCount}`)
  console.log(`  Will test:       ${wafProfile.metadata.includedCount}`)
  console.log(`  Skipped:         ${wafProfile.metadata.skippedCount}`)

  // Print endpoint decisions
  wafProfile.endpoints.forEach(e => {
    const icon = e.include ? '✅' : '❌'
    const warn = e.warning ? ` ⚠️  ${e.warning}` : ''
    console.log(`  ${icon} ${e.method.padEnd(6)} ${e.uri.padEnd(45)} ${String(e.hits).padStart(7)} hits  [${e.includeReason}]${warn}`)
  })

  // Find HAR file
  const harFiles = fs.existsSync(HAR_DIR)
    ? fs.readdirSync(HAR_DIR).filter(f => f.endsWith('.har'))
    : []

  let harData = { available: false, warning: `No HAR file in ${HAR_DIR}`, entries: {} }
  if (harFiles.length > 0) {
    const harFile = path.join(HAR_DIR, harFiles[0])
    harData = parseHAR(harFile, appConfig.baseUrl)
    console.log(`\n  HAR file: ${harFiles[0]} (${harData.entryCount} entries captured)`)
  } else {
    console.log(`\n  ⚠️  ${harData.warning}`)
    console.log(`  Payloads will be discovered from live API calls.\n`)
  }

  // Merge
  const merged = mergeWAFandHAR(wafProfile, harData)
  fs.mkdirSync(DISCOVERED_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(DISCOVERED_DIR, 'traffic-profile.json'),
    JSON.stringify(merged, null, 2)
  )

  console.log(`\n  ✅ Traffic profile saved to apps/${APP}/discovered/traffic-profile.json`)
}

async function runGenerate() {
  console.log(`\n[${APP}] STEP 2: Generating k6 scripts...`)

  const profilePath = path.join(DISCOVERED_DIR, 'traffic-profile.json')
  if (!fs.existsSync(profilePath)) {
    console.error(`  No traffic profile found. Run ingest step first.`)
    process.exit(1)
  }

  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  const result = generateNormalLoad(
    profile,
    appConfig,
    path.join(SCRIPTS_DIR, 'normal-load.js')
  )

  console.log(`  ✅ Generated ${result.scenarioCount} scenarios → ${result.written}`)
}

async function runTests() {
  console.log(`\n[${APP}] STEP 3: Running k6 tests...`)

  const scenarioMap = {
    'normal': 'normal-load.js',
    'peak': 'peak-load.js',
    'stress': 'stress-test.js',
    'smoke': 'smoke.js',
  }
  const scriptFile = scenarioMap[args.scenario] || 'normal-load.js'
  const scriptPath = path.join(SCRIPTS_DIR, scriptFile)

  if (!fs.existsSync(scriptPath)) {
    console.error(`  Script not found: ${scriptPath}`)
    process.exit(1)
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `${args.scenario}-${timestamp}.json`)

  const envFlags = [
    `BASE_URL="${appConfig.baseUrl}"`,
    `TEST_EMAIL="${process.env.TEST_EMAIL || ''}"`,
    `TEST_PASSWORD="${process.env.TEST_PASSWORD || ''}"`,
  ].join(' ')

  if (args.mode === 'cloud') {
    console.log(`  Mode: k6 CLOUD`)
    execSync(
      `k6 cloud --out json=${reportPath} ${scriptPath}`,
      { stdio: 'inherit', env: { ...process.env, BASE_URL: appConfig.baseUrl } }
    )
  } else {
    console.log(`  Mode: k6 LOCAL`)
    execSync(
      `k6 run --out json=${reportPath} ${scriptPath}`,
      { stdio: 'inherit', env: { ...process.env, BASE_URL: appConfig.baseUrl } }
    )
  }

  console.log(`\n  ✅ Report saved to ${reportPath}`)
}

async function loadAppConfig(appName, appDir) {
  // Default config — apps can override by placing config.json in their directory
  const configJsonPath = path.join(appDir, 'app.config.json')
  if (fs.existsSync(configJsonPath)) {
    return JSON.parse(fs.readFileSync(configJsonPath, 'utf8'))
  }

  // Defaults per known apps
  const defaults = {
    cds: {
      appName: 'cds',
      appHeaderName: 'ECG',
      baseUrl: process.env.BASE_URL || 'https://uat-ecg.tricogdev.net',
      loginEndpoint: '/api/v2/login',
      loginBody: {
        domainId:    process.env.TEST_DOMAIN   || 'Uatdomain3',
        username:    process.env.TEST_USERNAME || 'Karnan',
        password:    process.env.TEST_PASSWORD || 'tricog123',
        application: 'INSTA_ECG_VIEWER',
        appVersion:  '3.0.0',
      },
      tokenPath: 'token',
      tokenHeader: 'token',          // CDS uses 'token' header, not 'Authorization: Bearer'
      postLoginStep: {               // Called once in setup() after login — marks doctor online
        endpoint: '/api/v2/updateActive',
        body: { isActive: 1, captureEvent: false },
      },
      wafDomainFilter: 'ecg',
      customHeaders: {
        'clientdevicetype': 'Linux x86_64',
        'clientos':         'INSTA_ECG_VIEWER',
        'clientosversion':  '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'clientversion':    '0.14.4',
      },
    },
    admin: {
      appName: 'admin',
      appHeaderName: 'ADMIN',
      baseUrl: process.env.BASE_URL || 'https://uat-admin.tricogdev.net',
      loginEndpoint: '/api/login',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: 'token',
      wafDomainFilter: 'admin',
    },
    customer: {
      appName: 'customer',
      appHeaderName: 'CUSTOMER_PORTAL',
      baseUrl: process.env.BASE_URL || 'https://uat-customer.tricogdev.net',
      loginEndpoint: '/api/login',
      usernameField: 'username',
      passwordField: 'password',
      tokenPath: 'token',
      wafDomainFilter: 'customer',
    },
  }

  return defaults[appName] || {
    appName,
    appHeaderName: appName.toUpperCase(),
    baseUrl: process.env.BASE_URL || '',
    loginEndpoint: '/api/login',
    usernameField: 'username',
    passwordField: 'password',
    tokenPath: 'token',
  }
}
