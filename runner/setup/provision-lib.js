// Provisioning Library — reusable functions for user creation
// Used by both provision-users.js (standalone) and run-test.js (integrated)

import { chromium } from 'playwright'
import { ImapFlow } from 'imapflow'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '.auth')
const STORAGE_FILE = path.join(AUTH_DIR, 'admin-session.json')

const ADMIN_URL         = process.env.ADMIN_URL || 'https://uat-ecg-atlasadmin.tricogdev.net'
const ADMIN_DOMAIN      = process.env.ADMIN_DOMAIN || 'UatDomain3'
const CDS_URL           = process.env.BASE_URL || 'https://uat-ecg.tricogdev.net'
const GOOGLE_EMAIL      = process.env.GOOGLE_EMAIL
const GOOGLE_PASSWORD   = process.env.GOOGLE_PASSWORD
const GOOGLE_APP_PASSWORD = process.env.GOOGLE_APP_PASSWORD
const EMAIL_BASE        = GOOGLE_EMAIL

// ── Step 1: Google Sign-In → get tlas cookie ───────────────────
export async function getAdminSession() {
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  const hasSession = fs.existsSync(STORAGE_FILE)

  const browser = await chromium.launch({
    headless: hasSession,
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
      console.log(`  ✓ Reusing saved admin session (${parsed.email})`)
      const cookies = await context.cookies()
      const tlas = cookies.find(c => c.name === 'tlas')
      await browser.close()
      return tlas?.value
    }
  } catch (_) {}

  // Need fresh login
  console.log('  → Opening browser for Google Sign-In...')
  if (hasSession) {
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

  const googleBtn = page.locator('button:has-text("Google"), a:has-text("Google"), [class*="google"]').first()
  if (await googleBtn.isVisible()) {
    await googleBtn.click()
  }

  await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 }).catch(() => {})

  if (page.url().includes('accounts.google.com')) {
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill(GOOGLE_EMAIL)
      await page.locator('#identifierNext').click()
      await page.waitForTimeout(3000)
    }

    const passInput = page.locator('input[type="password"]')
    if (await passInput.isVisible()) {
      await passInput.fill(GOOGLE_PASSWORD)
      await page.locator('#passwordNext').click()
    }

    console.log('    Waiting for sign-in (complete 2FA if prompted)...')
    await page.waitForURL(`${ADMIN_URL}/**`, { timeout: 120000 })
  }

  console.log('  ✓ Google Sign-In complete')
  await context.storageState({ path: STORAGE_FILE })

  const cookies = await context.cookies()
  const tlas = cookies.find(c => c.name === 'tlas')
  await browser.close()
  return tlas?.value
}

// ── Step 2: Create user via admin API ──────────────────────────
export async function createUser(tlasCookie, n, prefix = 'lt') {
  const padded = String(n).padStart(3, '0')
  const userName = `${prefix}${padded}`
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

// ── Step 3: IMAP — read reset email and extract token ──────────
export async function findResetToken(userName, maxRetries = 10) {
  const emailLocal = EMAIL_BASE.split('@')[0]
  const emailDomain = EMAIL_BASE.split('@')[1]
  const targetEmail = `${emailLocal}+${userName}@${emailDomain}`

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GOOGLE_EMAIL, pass: GOOGLE_APP_PASSWORD },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const messages = await client.search({
        since: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })

      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 50); i--) {
        const msg = await client.fetchOne(messages[i], { source: true })
        let body = msg.source.toString()
        if (!body.includes(targetEmail)) continue

        body = body.replace(/=\r?\n/g, '')
        body = body.replace(/=3D/g, '=').replace(/=26/g, '&')

        const directMatch = body.match(/password\/new\?token=([a-f0-9-]+)/i)
        if (directMatch) {
          await client.logout()
          return directMatch[1]
        }

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
        process.stdout.write(` retry ${attempt}/${maxRetries}...`)
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    await client.logout()
    return null
  } catch (err) {
    console.log(` IMAP error: ${err.message}`)
    try { await client.logout() } catch (_) {}
    return null
  }
}

// ── Step 4: Set password via reset token ───────────────────────
export async function setPassword(token, password) {
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
