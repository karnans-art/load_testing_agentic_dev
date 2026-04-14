#!/usr/bin/env node
// Load Test Runner — orchestrates setup + k6 execution
//
// Usage:
//   node runner/run-test.js --app cds --script smoke
//   node runner/run-test.js --app cds --script smoke --setup 10
//   node runner/run-test.js --app cds --script production --setup 50 --cloud
//   node runner/run-test.js --app cds --script smoke --setup 10 --prefix lt
//
// Without --setup: runs k6 using existing users.json
// With --setup N:  provisions N users on-the-fly, runs k6, cleans up (no credentials stored)

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

const APP        = getArg('app', 'cds')
const SCRIPT     = getArg('script', 'smoke')
const SETUP_COUNT = getArg('setup', null)
const PREFIX     = getArg('prefix', 'ltkr')
const PASSWORD   = getArg('password', 'tricog123')
const CLOUD      = hasFlag('cloud')

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

// ── Temp file for dynamic users ────────────────────────────────
const TEMP_USERS_FILE = path.join(ROOT, `apps/${APP}/.tmp-users.json`)
let usedTempFile = false

function cleanup() {
  if (usedTempFile && fs.existsSync(TEMP_USERS_FILE)) {
    fs.unlinkSync(TEMP_USERS_FILE)
    console.log('\n✓ Temp credentials cleaned up (nothing stored on disk)')
  }
  // Restore original users.json if we swapped it
  const backupPath = usersJsonPath + '.bak'
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, usersJsonPath)
  }
}

process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

// ── Setup: provision users on-the-fly ──────────────────────────
async function provisionUsers(count) {
  // Dynamic import of the provisioning module
  const { getAdminSession, createUser, findResetTokens, setPassword } = await import('./setup/provision-lib.js')

  console.log(`\n🔧 Setting up ${count} test users (prefix: ${PREFIX})...\n`)

  // Step 1: Admin session
  const tlasCookie = await getAdminSession()
  if (!tlasCookie) {
    console.error('Error: Could not get admin session')
    process.exit(1)
  }

  // Step 2: Create users
  const users = []
  for (let i = 1; i <= count; i++) {
    const result = await createUser(tlasCookie, i, PREFIX)
    if (result.success) users.push(result)
    await new Promise(r => setTimeout(r, 500))
  }

  // Step 3 & 4: Batch fetch reset tokens (single IMAP connection) + set passwords
  const newUsers = users.filter(u => !u.skipped)
  const readyUsers = []

  if (newUsers.length > 0) {
    console.log('\n  Waiting 5s for reset emails...')
    await new Promise(r => setTimeout(r, 5000))

    const tokens = await findResetTokens(newUsers.map(u => u.userName))

    for (const user of newUsers) {
      process.stdout.write(`  ${user.userName}: `)
      const token = tokens[user.userName]?.token
      if (token) {
        const ok = await setPassword(token, PASSWORD)
        if (ok) {
          console.log('✓ ready')
          readyUsers.push({ domainId: process.env.ADMIN_DOMAIN || 'UatDomain3', username: user.userName, password: PASSWORD })
        } else {
          console.log('✗ password failed')
        }
      } else {
        console.log('✗ no email')
      }
    }
  }

  // Skipped users (already exist) — NOT added to ready list
  // We can't guarantee their password matches PASSWORD
  const skippedCount = users.filter(u => u.skipped).length
  if (skippedCount > 0) {
    console.log(`  ⚠ ${skippedCount} users skipped (already exist) — not included (password unknown)`)
  }

  console.log(`\n✓ ${readyUsers.length} users ready\n`)
  return { users: readyUsers, newlyCreated: newUsers.map(u => u.userName) }
}

// ── Run k6 ─────────────────────────────────────────────────────
function runK6(usersFile) {
  const k6Args = ['run']

  if (CLOUD) k6Args.push('--out', 'cloud')

  k6Args.push(
    '-e', `BASE_URL=${process.env.BASE_URL}`,
    '-e', `TEST_EMAIL=${process.env.TEST_EMAIL || ''}`,
    '-e', `TEST_PASSWORD=${process.env.TEST_PASSWORD || ''}`,
    scriptPath
  )

  console.log(`▶ k6 ${k6Args.join(' ')}\n`)

  return new Promise((resolve) => {
    const k6 = spawn('k6', k6Args, {
      stdio: 'inherit',
      env: { ...process.env },
    })
    k6.on('close', (code) => resolve(code))
  })
}

// ── Teardown: deactivate dynamically created users ────────────
async function teardownUsers(createdUserNames) {
  if (createdUserNames.length === 0) return

  const { getAdminSession, deactivateUser } = await import('./setup/provision-lib.js')
  const tlasCookie = await getAdminSession()
  if (!tlasCookie) {
    console.error('  ✗ Cannot deactivate users — no admin cookie')
    return
  }

  console.log(`\n🧹 Deactivating ${createdUserNames.length} dynamic users...\n`)
  for (const userName of createdUserNames) {
    await deactivateUser(tlasCookie, userName)
  }
  console.log('')
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  let createdUserNames = []  // only users created in THIS run (not skipped)

  if (SETUP_COUNT) {
    const count = parseInt(SETUP_COUNT)
    const { users, newlyCreated } = await provisionUsers(count)

    if (users.length === 0) {
      console.error('No users provisioned. Aborting.')
      process.exit(1)
    }

    createdUserNames = newlyCreated

    // Backup original users.json, write temp users
    if (fs.existsSync(usersJsonPath)) {
      fs.copyFileSync(usersJsonPath, usersJsonPath + '.bak')
    }
    fs.writeFileSync(usersJsonPath, JSON.stringify({ users }, null, 2))
    usedTempFile = true

    console.log(`── Running ${SCRIPT} with ${users.length} dynamic users ──\n`)
  } else {
    console.log(`── Running ${SCRIPT} with existing users.json ──\n`)
  }

  const exitCode = await runK6(usersJsonPath)

  // Deactivate only dynamically created users (never hardcoded ones)
  if (createdUserNames.length > 0) {
    await teardownUsers(createdUserNames)
  }

  process.exit(exitCode)
}

main().catch(err => {
  console.error('Fatal:', err)
  cleanup()
  process.exit(1)
})
