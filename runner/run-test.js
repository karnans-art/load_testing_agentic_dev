#!/usr/bin/env node
// Load Test Runner — runs k6 tests using existing users.json
//
// Usage:
//   node runner/run-test.js --app cds --script smoke
//   node runner/run-test.js --app cds --script smoke --cloud
//   node runner/run-test.js --app cds --script smoke --setup 50 --cloud
//
// Users come from apps/<app>/users.json (pre-created via: npm run create-users:cds)
// --setup N uses first N users from users.json (1:1 VU mapping, no session collision)
// Without --setup: uses all users from users.json

import 'dotenv/config'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Parse args ─────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal
}
function hasFlag(name) {
  return args.includes(`--${name}`)
}

const APP    = getArg('app', 'cds')
const SCRIPT = getArg('script', 'smoke')
const SETUP  = getArg('setup', null)
const CLOUD  = hasFlag('cloud')

const SCRIPT_MAP = {
  smoke:      'smoke.js',
  normal:     'normal-load.js',
  peak:       'peak-load.js',
  stress:     'stress-test.js',
  production: 'production-load.js',
}

const scriptFile = SCRIPT_MAP[SCRIPT] || `${SCRIPT}.js`
const scriptPath = path.join(ROOT, `apps/${APP}/scripts/${scriptFile}`)
const usersJsonPath = path.join(ROOT, `apps/${APP}/users.json`)

if (!fs.existsSync(scriptPath)) {
  console.error(`Script not found: ${scriptPath}`)
  process.exit(1)
}

if (!fs.existsSync(usersJsonPath)) {
  console.error(`Users file not found: ${usersJsonPath}`)
  console.error(`Create users first: npm run create-users:${APP}`)
  process.exit(1)
}

// ── Main ───────────────────────────────────────────────────────
const users = JSON.parse(fs.readFileSync(usersJsonPath, 'utf8')).users
const vuCount = SETUP ? Math.min(parseInt(SETUP), users.length) : users.length

console.log(`── Running ${SCRIPT} with ${vuCount}/${users.length} users ──\n`)

const k6Args = ['run']
if (CLOUD) k6Args.push('--out', 'cloud')

k6Args.push(
  '-e', `BASE_URL=${process.env.BASE_URL}`,
  '-e', `MAX_VUS=${vuCount}`,
  scriptPath
)

console.log(`▶ k6 ${k6Args.join(' ')}\n`)

const k6 = spawn('k6', k6Args, {
  stdio: 'inherit',
  env: { ...process.env },
})
k6.on('close', (code) => process.exit(code))
