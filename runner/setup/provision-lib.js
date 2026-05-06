// Provisioning Library — reusable functions for user creation
// Used by both provision-users.js (standalone) and run-test.js (integrated)
//
// Requires: CDS_ADMIN_COOKIE env var — full cookie string (name=value) from dev-new-ecg-atlasadmin.tricogdev.net

import { ImapFlow } from 'imapflow'

const ADMIN_URL           = process.env.ADMIN_URL
const ADMIN_DOMAIN        = process.env.ADMIN_DOMAIN
const CDS_URL             = process.env.BASE_URL
const GOOGLE_EMAIL        = process.env.GOOGLE_EMAIL
const GOOGLE_APP_PASSWORD = process.env.GOOGLE_APP_PASSWORD
const EMAIL_BASE          = GOOGLE_EMAIL

const _missing = ['ADMIN_URL', 'ADMIN_DOMAIN', 'BASE_URL', 'GOOGLE_EMAIL', 'GOOGLE_APP_PASSWORD']
  .filter(k => !process.env[k])
if (_missing.length) throw new Error(`Missing required env vars: ${_missing.join(', ')} — set them in .env`)

// ── Step 1: Read admin cookie from env ────────────────────────
export async function getAdminSession() {
  const cookie = process.env.CDS_ADMIN_COOKIE
  if (!cookie) {
    console.error('  ✗ CDS_ADMIN_COOKIE env var is not set')
    console.error('    Get it from: https://dev-new-ecg-atlasadmin.tricogdev.net → DevTools → Application → Cookies → copy the session cookie as name=value')
    return null
  }
  console.log('  ✓ Using CDS_ADMIN_COOKIE from env')
  return cookie
}

// ── Step 2: Create user via admin API ──────────────────────────
export async function createUser(adminCookie, n, prefix = 'lt', domain = null) {
  const useDomain = domain || ADMIN_DOMAIN
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
      'cookie': adminCookie,
      'domain': useDomain,
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

// ── Step 3: IMAP — batch fetch reset tokens with reconnect ────
export async function findResetTokens(userNames, maxRetries = 10) {
  const emailLocal = EMAIL_BASE.split('@')[0]
  const emailDomain = EMAIL_BASE.split('@')[1]

  const targets = {}
  for (const userName of userNames) {
    targets[userName] = { email: `${emailLocal}+${userName}@${emailDomain}`, token: null }
  }

  async function createClient(retries = 3) {
    for (let i = 1; i <= retries; i++) {
      try {
        const client = new ImapFlow({
          host: 'imap.gmail.com',
          port: 993,
          secure: true,
          auth: { user: GOOGLE_EMAIL, pass: GOOGLE_APP_PASSWORD },
          logger: false,
          socketTimeout: 30000,
          greetingTimeout: 15000,
        })
        client.on('error', () => {})  // prevent unhandled error crash
        await client.connect()
        await client.mailboxOpen('INBOX')
        return client
      } catch (err) {
        console.log(`  IMAP connect attempt ${i}/${retries} failed: ${err.message}`)
        if (i < retries) await new Promise(r => setTimeout(r, 5000))
      }
    }
    return null
  }

  async function extractToken(body) {
    let decoded = body.replace(/=\r?\n/g, '')
    decoded = decoded.replace(/=3D/g, '=').replace(/=26/g, '&')

    const directMatch = decoded.match(/password\/new\?token=([a-f0-9-]+)/i)
    if (directMatch) return directMatch[1]

    const trackingUrls = decoded.match(/https:\/\/email\.mail\.tricogdev\.net\/c\/[^\s"<>]+/g) || []
    for (const url of trackingUrls) {
      try {
        const res = await fetch(url, { redirect: 'manual' })
        const location = res.headers.get('location') || ''
        const tokenMatch = location.match(/password\/new\?token=([a-f0-9-]+)/i)
        if (tokenMatch) return tokenMatch[1]
      } catch (_) {}
    }
    return null
  }

  let client = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const pending = userNames.filter(u => !targets[u].token)
    if (pending.length === 0) break

    // Connect or reconnect
    if (!client) {
      client = await createClient()
      if (!client) {
        console.log(`  IMAP connect failed after retries, waiting 10s...`)
        await new Promise(r => setTimeout(r, 10000))
        continue
      }
    }

    try {
      const messages = await client.search({
        since: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })
      console.log(`  IMAP: ${messages.length} recent messages found, scanning last ${Math.min(messages.length, 200)}...`)

      let matched = 0
      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 200); i--) {
        const msg = await client.fetchOne(messages[i], { source: true })
        const body = msg.source.toString()

        for (const userName of pending) {
          if (!body.includes(targets[userName].email)) continue
          const token = await extractToken(body)
          if (token && !targets[userName].token) {  // keep newest — don't overwrite
            targets[userName].token = token
            matched++
          }
          break
        }
      }
      console.log(`  IMAP: matched ${matched}/${pending.length} tokens`)
    } catch (err) {
      console.log(`  IMAP error: ${err.message} — reconnecting...`)
      try { await client.logout() } catch (_) {}
      client = null
      await new Promise(r => setTimeout(r, 5000))
      continue
    }

    const remaining = userNames.filter(u => !targets[u].token)
    if (remaining.length === 0) break
    if (attempt < maxRetries) {
      process.stdout.write(`  retry ${attempt}/${maxRetries} (${remaining.length} pending)...\n`)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  if (client) {
    try { await client.logout() } catch (_) {}
  }

  return targets
}

// ── Step 3b: Trigger password reset email for existing user ──────
export async function triggerPasswordReset(username, domain) {
  const res = await fetch(`${CDS_URL}/api/v2/password/forgot`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'clientdevicetype': 'Linux x86_64',
      'clientos':         'INSTA_ECG_VIEWER',
      'clientosversion':  '5.0 (X11; Linux x86_64)',
      'clientversion':    '0.14.4',
      'domain':           domain || ADMIN_DOMAIN,
    },
    body: JSON.stringify({ username, domainId: domain || ADMIN_DOMAIN }),
  })
  const ok = res.status >= 200 && res.status < 300
  if (!ok) {
    let body = ''
    try { body = await res.text() } catch (_) {}
    console.error(`  triggerPasswordReset failed for ${username}: ${res.status} — ${body.slice(0, 200)}`)
  }
  return ok
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

  if (res.status < 200 || res.status >= 300) {
    let body = ''
    try { body = await res.text() } catch (_) {}
    console.error(`  setPassword failed: ${res.status} — ${body.slice(0, 300)}`)
  }
  return res.status >= 200 && res.status < 300
}

// ── Step 5: Re-activate a deactivated user ────────────────────
export async function reactivateUser(adminCookie, userName) {
  const res = await fetch(`${ADMIN_URL}/api/hub/toggle-status`, {
    method: 'PUT',
    headers: {
      'Content-Type':     'application/json',
      'cookie':           adminCookie,
      'domain':           ADMIN_DOMAIN,
      'clientdevicetype': 'Linux x86_64',
      'clientos':         'ATLAS_ADMIN',
      'clientosversion':  '5.0 (X11; Linux x86_64)',
      'clientversion':    '2.10.0',
    },
    body: JSON.stringify({
      username: userName,
      status: 'ACTIVATED',
      userActionReason: 'Load test — re-activating for reuse',
    }),
  })
  return res.status >= 200 && res.status < 300
}

// ── Step 6: Deactivate user after load test ───────────────────
export async function deactivateUser(adminCookie, userName) {
  const res = await fetch(`${ADMIN_URL}/api/hub/toggle-status`, {
    method: 'PUT',
    headers: {
      'Content-Type':     'application/json',
      'cookie':           adminCookie,
      'domain':           ADMIN_DOMAIN,
      'clientdevicetype': 'Linux x86_64',
      'clientos':         'ATLAS_ADMIN',
      'clientosversion':  '5.0 (X11; Linux x86_64)',
      'clientversion':    '2.10.0',
    },
    body: JSON.stringify({
      username: userName,
      status: 'DEACTIVATED',
      userActionReason: 'Load test cleanup — auto-deactivated',
    }),
  })

  const status = res.status
  if (status >= 200 && status < 300) {
    console.log(`  ✓ Deactivated ${userName}`)
    return true
  } else {
    let body = ''
    try { body = await res.text() } catch (_) {}
    console.log(`  ✗ Failed to deactivate ${userName}: ${status} — ${body.slice(0, 200)}`)
    return false
  }
}
