#!/usr/bin/env node
// Standalone user creation script
// Creates N users in batches, sets random passwords via IMAP, saves to users.json
// Aborts entirely if any IMAP batch fails
//
// Usage:
//   node runner/create-users.js --count 100 --domain LoadTest3 --prefix ltkr --batch 10
//   npm run create-users:cds -- --count 100

import 'dotenv/config'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getAdminSession, createUser, findResetTokens, setPassword, triggerPasswordReset } from './setup/provision-lib.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Parse args ────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal
}

const APP        = getArg('app', 'cds')
const COUNT      = parseInt(getArg('count', '100'))
const START      = parseInt(getArg('start', '1'))
const BATCH_SIZE = parseInt(getArg('batch', '10'))
const PREFIX     = getArg('prefix', 'ltkr')
const DOMAIN     = getArg('domain', process.env.ADMIN_DOMAIN || 'LoadTest3')
const DELAY_MS   = parseInt(getArg('delay', '1000'))  // delay between each user creation
const IMAP_WAIT  = parseInt(getArg('imap-wait', '10000'))  // wait for emails before IMAP

const usersJsonPath = path.join(ROOT, `apps/${APP}/users.json`)

function randomPassword() {
  return crypto.randomBytes(16).toString('base64url')
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const END = START + COUNT - 1
  console.log(`\n=== Creating ${COUNT} users in ${DOMAIN} (${PREFIX}${String(START).padStart(3,'0')}-${PREFIX}${String(END).padStart(3,'0')}, batch: ${BATCH_SIZE}) ===\n`)

  // Step 1: Admin session
  const tlasCookie = await getAdminSession()
  if (!tlasCookie) {
    console.error('Error: Could not get admin session')
    process.exit(1)
  }

  const allUsers = []     // { username, password, domainId }
  const totalBatches = Math.ceil(COUNT / BATCH_SIZE)

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchStart = START + batch * BATCH_SIZE
    const batchEnd = Math.min(START + (batch + 1) * BATCH_SIZE - 1, END)
    const batchNum = batch + 1

    console.log(`\n── Batch ${batchNum}/${totalBatches} (users ${batchStart}-${batchEnd}) ──\n`)

    // Step 2: Create users in this batch
    const batchCreated = []
    for (let i = batchStart; i <= batchEnd; i++) {
      const result = await createUser(tlasCookie, i, PREFIX, DOMAIN)
      if (!result.success) {
        console.error(`\n✗ ABORT — failed to create user ${PREFIX}${String(i).padStart(3, '0')}`)
        if (allUsers.length > 0) saveUsers(allUsers)
        process.exit(1)
      }
      if (!result.skipped) {
        batchCreated.push(result)
      } else {
        const ok = await triggerPasswordReset(result.userName, DOMAIN)
        if (ok) {
          batchCreated.push(result)
          console.log(`    → reset email triggered`)
        } else {
          console.error(`\n✗ ABORT — could not trigger reset for existing user ${result.userName}`)
          if (allUsers.length > 0) saveUsers(allUsers)
          process.exit(1)
        }
      }
      await delay(DELAY_MS)
    }

    // Step 3: IMAP — batch fetch reset tokens for NEW users
    if (batchCreated.length > 0) {
      console.log(`\n  Waiting ${IMAP_WAIT / 1000}s for ${batchCreated.length} reset emails...`)
      await delay(IMAP_WAIT)

      const userNames = batchCreated.map(u => u.userName)
      const tokens = await findResetTokens(userNames)

      // Step 4: Set passwords
      for (const user of batchCreated) {
        const token = tokens[user.userName]?.token
        if (!token) {
          console.error(`\n✗ ABORT — no reset email for ${user.userName}. IMAP may be rate-limited.`)
          if (allUsers.length > 0) saveUsers(allUsers)
          process.exit(1)
        }

        const password = randomPassword()
        process.stdout.write(`  ${user.userName}: `)
        const ok = await setPassword(token, password)
        if (!ok) {
          console.error(`\n✗ ABORT — failed to set password for ${user.userName}`)
          if (allUsers.length > 0) saveUsers(allUsers)
          process.exit(1)
        }

        console.log(`✓ ready (${password.slice(0, 6)}...)`)
        allUsers.push({ domainId: DOMAIN, username: user.userName, password })
        await delay(300)
      }
    }

    console.log(`\n  Batch ${batchNum} complete — ${allUsers.length} users ready so far`)

    // Brief pause between batches to avoid rate limits
    if (batch < totalBatches - 1) {
      console.log(`  Pausing 3s before next batch...`)
      await delay(3000)
    }
  }

  // Step 5: Save all users to users.json
  saveUsers(allUsers)
  console.log(`\n=== Done. ${allUsers.length} users saved to ${usersJsonPath} ===\n`)
}

function loadExistingUsers() {
  try {
    const raw = fs.readFileSync(usersJsonPath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.users) ? parsed.users : []
  } catch {
    return []
  }
}

function saveUsers(newUsers) {
  const existing = loadExistingUsers()
  const existingNames = new Set(existing.map(u => u.username))
  const merged = [...existing]
  for (const u of newUsers) {
    if (!existingNames.has(u.username)) {
      merged.push(u)
      existingNames.add(u.username)
    }
  }
  fs.writeFileSync(usersJsonPath, JSON.stringify({ users: merged }, null, 2) + '\n')
  console.log(`  Saved ${newUsers.length} new + ${existing.length} existing = ${merged.length} total in ${usersJsonPath}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
