#!/usr/bin/env node
// Test User Provisioning Script
//
// Flow:
//   1. Playwright → Google Sign-In → extract tlas session cookie
//   2. Create N doctor users via POST /api/hubdoctor
//   3. Gmail API → read password reset emails → extract reset tokens
//   4. POST /api/v2/password/update → set password for each user
//   5. Write users.json
//
// Usage:
//   node runner/setup/provision-users.js --count 10
//   node runner/setup/provision-users.js --count 100 --prefix lt
//
// First run opens a visible browser for Google Sign-In (handles 2FA).
// Session is saved to runner/setup/.auth/ for reuse.

import 'dotenv/config'
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '.auth')
const STORAGE_FILE = path.join(AUTH_DIR, 'admin-session.json')

// ── Config from .env ───────────────────────────────────────────
const ADMIN_URL       = process.env.ADMIN_URL || 'https://uat-ecg-atlasadmin.tricogdev.net'
const ADMIN_DOMAIN    = process.env.ADMIN_DOMAIN || 'UatDomain3'
const CDS_URL         = process.env.BASE_URL || 'https://uat-ecg.tricogdev.net'
const GOOGLE_EMAIL    = process.env.GOOGLE_EMAIL
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD

// ── CLI args ───────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal
}

const USER_COUNT    = parseInt(getArg('count', '10'))
const PREFIX        = getArg('prefix', 'lt')
const PASSWORD      = getArg('password', 'tricog123')
const EMAIL_BASE    = GOOGLE_EMAIL // e.g., karnan.s@tricog.com
const USERS_JSON    = path.resolve(__dirname, '../../apps/cds/users.json')

console.log(`\n🔧 Provisioning ${USER_COUNT} test users (prefix: ${PREFIX})`)
console.log(`   Admin: ${ADMIN_URL}`)
console.log(`   Domain: ${ADMIN_DOMAIN}`)
console.log(`   Email base: ${EMAIL_BASE}\n`)

// ── Step 1: Google Sign-In → get tlas cookie ───────────────────
async function getAdminSession() {
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  // Reuse saved session if it exists
  const hasSession = fs.existsSync(STORAGE_FILE)

  const browser = await chromium.launch({
    headless: hasSession, // visible on first run for 2FA
  })

  const context = hasSession
    ? await browser.newContext({ storageState: STORAGE_FILE })
    : await browser.newContext()

  const page = await context.newPage()

  // Check if session is still valid
  await page.goto(`${ADMIN_URL}/api/loggedIn`, { waitUntil: 'domcontentloaded' })
  const text = await page.textContent('body')

  try {
    const parsed = JSON.parse(text)
    if (parsed && parsed.email) {
      console.log(`✓ Reusing saved session (${parsed.email})`)
      const cookies = await context.cookies()
      const tlas = cookies.find(c => c.name === 'tlas')
      await browser.close()
      return tlas?.value
    }
  } catch (_) {}

  // Need fresh login
  console.log('→ Opening browser for Google Sign-In...')
  if (hasSession) {
    // Reopen with visible browser
    await browser.close()
    const visibleBrowser = await chromium.launch({ headless: false })
    const visibleContext = await visibleBrowser.newContext()
    const visiblePage = await visibleContext.newPage()
    return await doGoogleSignIn(visibleBrowser, visibleContext, visiblePage)
  }
  return await doGoogleSignIn(browser, context, page)
}

async function doGoogleSignIn(browser, context, page) {
  await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle' })

  // Click Google Sign-In button
  const googleBtn = page.locator('button:has-text("Google"), a:has-text("Google"), [class*="google"]').first()
  if (await googleBtn.isVisible()) {
    await googleBtn.click()
  }

  // Wait for Google login page
  await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 }).catch(() => {})

  if (page.url().includes('accounts.google.com')) {
    // Enter email
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill(GOOGLE_EMAIL)
      await page.locator('#identifierNext').click()
      await page.waitForTimeout(3000)
    }

    // Enter password
    const passInput = page.locator('input[type="password"]')
    if (await passInput.isVisible()) {
      await passInput.fill(GOOGLE_PASSWORD)
      await page.locator('#passwordNext').click()
    }

    // Wait for 2FA or redirect — give user time to complete manually
    console.log('   Waiting for sign-in to complete (complete 2FA if prompted)...')
    await page.waitForURL(`${ADMIN_URL}/**`, { timeout: 120000 })
  }

  console.log('✓ Google Sign-In complete')

  // Save session for future runs
  await context.storageState({ path: STORAGE_FILE })

  // Extract tlas cookie
  const cookies = await context.cookies()
  const tlas = cookies.find(c => c.name === 'tlas')

  await browser.close()
  return tlas?.value
}

// ── Step 2: Create users via admin API ─────────────────────────
async function createUser(tlasCookie, n) {
  const padded = String(n).padStart(3, '0')
  const userName = `${PREFIX}${padded}`
  const emailLocal = EMAIL_BASE.split('@')[0]
  const emailDomain = EMAIL_BASE.split('@')[1]
  const email = `${emailLocal}+${userName}@${emailDomain}`

  const formData = new FormData()
  formData.append('role', 'DOCTOR')
  formData.append('fullName', `LoadTest Doctor ${padded}`)
  formData.append('userName', userName)
  formData.append('qualifications', 'mbbs')
  formData.append('designation', 'doctor')
  formData.append('phoneNumber', `90489${String(n).padStart(5, '0')}`)
  formData.append('registrationNumber', `LT${String(n).padStart(5, '0')}`)
  formData.append('email', email)
  formData.append('noSignature', '1')
  formData.append('signatureId', '')
  formData.append('timeZone', 'Asia/Kolkata')
  formData.append('privileges', JSON.stringify({
    viewCase: 'ALL',
    diagnosisType: 'TEXT',
    assignment: 'ALL',
    assignmentNotification: 0,
    assignmentRemainders: { hours: [], enabled: 0 },
    platformAccess: { web: 1, mobile: 1 },
  }))
  formData.append('userActionReason', 'Load testing user provisioning')

  const res = await fetch(`${ADMIN_URL}/api/hubdoctor`, {
    method: 'POST',
    headers: {
      'cookie': `tlas=${tlasCookie}`,
      'domain': ADMIN_DOMAIN,
      'clientdevicetype': 'Linux x86_64',
      'clientos': 'ATLAS_ADMIN',
      'clientosversion': '5.0 (X11; Linux x86_64)',
      'clientversion': '2.10.0',
    },
    body: formData,
  })

  const status = res.status
  let body = ''
  try { body = await res.text() } catch (_) {}

  if (status >= 200 && status < 300) {
    console.log(`  ✓ Created ${userName} (${email})`)
    return { userName, email, success: true }
  } else if (status === 409 || body.includes('already exist') || body.includes('duplicate')) {
    console.log(`  ~ Skipped ${userName} (already exists)`)
    return { userName, email, success: true, skipped: true }
  } else {
    console.log(`  ✗ Failed ${userName}: ${status} — ${body.slice(0, 200)}`)
    return { userName, email, success: false, error: body }
  }
}

// ── Step 3: IMAP — read reset emails and extract tokens ────────
import { ImapFlow } from 'imapflow'

const GOOGLE_APP_PASSWORD = process.env.GOOGLE_APP_PASSWORD

async function findResetToken(userName, maxRetries = 10) {
  const emailLocal = EMAIL_BASE.split('@')[0]
  const emailDomain = EMAIL_BASE.split('@')[1]
  const targetEmail = `${emailLocal}+${userName}@${emailDomain}`

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: GOOGLE_EMAIL,
      pass: GOOGLE_APP_PASSWORD,
    },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Search recent emails (Gmail IMAP doesn't filter +aliases well)
      const messages = await client.search({
        since: new Date(Date.now() - 2 * 60 * 60 * 1000), // last 2 hours
      })

      // Check each recent email for our target alias
      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 50); i--) {
        const msg = await client.fetchOne(messages[i], { source: true })
        let body = msg.source.toString()

        // Check if this email is addressed to our alias
        if (!body.includes(targetEmail)) continue

        // Decode quoted-printable (=\n joins, =3D is =)
        body = body.replace(/=\r?\n/g, '')
        body = body.replace(/=3D/g, '=').replace(/=26/g, '&')

        // Try direct token link first
        const directMatch = body.match(/password\/new\?token=([a-f0-9-]+)/i)
        if (directMatch) {
          await client.logout()
          return directMatch[1]
        }

        // Follow tracking redirect URLs (email.mail.tricogdev.net/c/...)
        const trackingUrls = body.match(/https:\/\/email\.mail\.tricogdev\.net\/c\/[^\s"<>]+/g) || []
        for (const url of trackingUrls) {
          try {
            const res = await fetch(url, { redirect: 'manual' })
            const location = res.headers.get('location') || ''
            const tokenMatch = location.match(/password\/new\?token=([a-f0-9-]+)/i)
            if (tokenMatch) {
              await client.logout()
              return tokenMatch[1]
            }
          } catch (_) {}
        }
      }

      if (attempt < maxRetries) {
        console.log(` retry ${attempt}/${maxRetries}...`)
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    await client.logout()
    return null
  } catch (err) {
    console.log(`    IMAP error: ${err.message}`)
    try { await client.logout() } catch (_) {}
    return null
  }
}

// ── Step 4: Set password via reset token ───────────────────────
async function setPassword(token, password) {
  const res = await fetch(`${CDS_URL}/api/v2/password/update`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'clientdevicetype': 'Linux x86_64',
      'clientos':         'INSTA_ECG_VIEWER',
      'clientosversion':  '5.0 (X11; Linux x86_64)',
      'clientversion':    '0.14.4',
    },
    body: JSON.stringify({ password, token }),
  })

  return res.status >= 200 && res.status < 300
}

// ── Step 5: Write users.json ───────────────────────────────────
function writeUsersJson(users) {
  // Read existing users
  let existing = { users: [] }
  if (fs.existsSync(USERS_JSON)) {
    existing = JSON.parse(fs.readFileSync(USERS_JSON, 'utf-8'))
  }

  // Merge — don't duplicate
  const existingNames = new Set(existing.users.map(u => u.username))
  const newUsers = users
    .filter(u => !existingNames.has(u.username))
    .map(u => ({
      domainId: ADMIN_DOMAIN,
      username: u.username,
      password: u.password,
    }))

  existing.users.push(...newUsers)
  fs.writeFileSync(USERS_JSON, JSON.stringify(existing, null, 2) + '\n')
  console.log(`\n✓ Written ${newUsers.length} new users to ${USERS_JSON}`)
  console.log(`  Total users: ${existing.users.length}`)
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!GOOGLE_EMAIL || !GOOGLE_PASSWORD) {
    console.error('Error: GOOGLE_EMAIL and GOOGLE_PASSWORD must be set in .env')
    process.exit(1)
  }

  // Step 1: Get admin session
  const tlasCookie = await getAdminSession()
  if (!tlasCookie) {
    console.error('Error: Could not get admin session cookie')
    process.exit(1)
  }
  console.log(`✓ Got tlas session cookie\n`)

  // Step 2: Create users
  console.log(`Creating ${USER_COUNT} users...\n`)
  const created = []
  for (let i = 1; i <= USER_COUNT; i++) {
    const result = await createUser(tlasCookie, i)
    if (result.success) created.push(result)
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n✓ Created ${created.length}/${USER_COUNT} users`)

  // Step 3 & 4: Read reset emails + set passwords
  const usersReady = []
  const nonSkipped = created.filter(u => !u.skipped)

  if (nonSkipped.length > 0 && GOOGLE_APP_PASSWORD) {
    console.log(`\nSetting passwords via email reset tokens...\n`)
    // Wait a few seconds for emails to arrive
    console.log('  Waiting 5s for emails to arrive...')
    await new Promise(r => setTimeout(r, 5000))

    for (const user of nonSkipped) {
      process.stdout.write(`  ${user.userName}: reading email...`)
      const token = await findResetToken(user.userName)
      if (token) {
        const ok = await setPassword(token, PASSWORD)
        if (ok) {
          console.log(` ✓ password set`)
          usersReady.push({ username: user.userName, password: PASSWORD })
        } else {
          console.log(` ✗ password update failed`)
        }
      } else {
        console.log(` ✗ no reset email found`)
      }
    }
  } else if (nonSkipped.length > 0) {
    console.log(`\n⚠️  GOOGLE_APP_PASSWORD not set in .env — cannot read reset emails`)
    console.log(`   Set passwords manually or add GOOGLE_APP_PASSWORD and rerun`)
  }

  // Add skipped users (already exist, assume password is set)
  const skipped = created.filter(u => u.skipped)
  for (const user of skipped) {
    usersReady.push({ username: user.userName, password: PASSWORD })
  }

  if (usersReady.length > 0) {
    writeUsersJson(usersReady)
  }

  console.log(`\nDone! ${usersReady.length} users ready for load testing.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
