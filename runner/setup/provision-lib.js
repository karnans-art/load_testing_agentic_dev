// Provisioning Library — reusable functions for user creation
// Used by both provision-users.js (standalone) and run-test.js (integrated)
//
// Requires: CDS_ADMIN_COOKIE env var (tlas cookie from uat-ecg-atlasadmin.tricogdev.net)

import { ImapFlow } from 'imapflow'

const ADMIN_URL         = process.env.ADMIN_URL || 'https://uat-ecg-atlasadmin.tricogdev.net'
const ADMIN_DOMAIN      = process.env.ADMIN_DOMAIN || 'UatDomain3'
const CDS_URL           = process.env.BASE_URL || 'https://uat-ecg.tricogdev.net'
const GOOGLE_EMAIL      = process.env.GOOGLE_EMAIL
const GOOGLE_APP_PASSWORD = process.env.GOOGLE_APP_PASSWORD
const EMAIL_BASE        = GOOGLE_EMAIL

// ── Step 1: Read admin cookie from env ────────────────────────
export async function getAdminSession() {
  const cookie = process.env.CDS_ADMIN_COOKIE
  if (!cookie) {
    console.error('  ✗ CDS_ADMIN_COOKIE env var is not set')
    console.error('    Get it from: https://uat-ecg-atlasadmin.tricogdev.net → browser cookies → tlas value')
    return null
  }
  console.log('  ✓ Using CDS_ADMIN_COOKIE from env')
  return cookie
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

// ── Step 3: IMAP — batch fetch all reset tokens in one connection ──
export async function findResetTokens(userNames, maxRetries = 10) {
  const emailLocal = EMAIL_BASE.split('@')[0]
  const emailDomain = EMAIL_BASE.split('@')[1]

  // Map: userName → target email
  const targets = {}
  for (const userName of userNames) {
    targets[userName] = { email: `${emailLocal}+${userName}@${emailDomain}`, token: null }
  }

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
      const pending = userNames.filter(u => !targets[u].token)
      if (pending.length === 0) break

      const messages = await client.search({
        since: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })

      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 100); i--) {
        const msg = await client.fetchOne(messages[i], { source: true })
        let body = msg.source.toString()

        // Check which user this email belongs to
        for (const userName of pending) {
          if (!body.includes(targets[userName].email)) continue

          let decoded = body.replace(/=\r?\n/g, '')
          decoded = decoded.replace(/=3D/g, '=').replace(/=26/g, '&')

          const directMatch = decoded.match(/password\/new\?token=([a-f0-9-]+)/i)
          if (directMatch) {
            targets[userName].token = directMatch[1]
            break
          }

          const trackingUrls = decoded.match(/https:\/\/email\.mail\.tricogdev\.net\/c\/[^\s"<>]+/g) || []
          for (const url of trackingUrls) {
            try {
              const res = await fetch(url, { redirect: 'manual' })
              const location = res.headers.get('location') || ''
              const tokenMatch = location.match(/password\/new\?token=([a-f0-9-]+)/i)
              if (tokenMatch) {
                targets[userName].token = tokenMatch[1]
                break
              }
            } catch (_) {}
          }
          break
        }
      }

      const remaining = userNames.filter(u => !targets[u].token)
      if (remaining.length === 0) break
      if (attempt < maxRetries) {
        process.stdout.write(`  retry ${attempt}/${maxRetries} (${remaining.length} pending)...`)
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    await client.logout()
  } catch (err) {
    console.log(` IMAP error: ${err.message}`)
    try { await client.logout() } catch (_) {}
  }

  return targets
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

// ── Step 5: Deactivate user after load test ───────────────────
export async function deactivateUser(tlasCookie, userName) {
  const res = await fetch(`${ADMIN_URL}/api/hub/toggle-status`, {
    method: 'PUT',
    headers: {
      'Content-Type':     'application/json',
      'cookie':           `tlas=${tlasCookie}`,
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
