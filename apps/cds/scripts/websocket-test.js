// CDS — WebSocket / Socket.IO Load Test
// Isolated WebSocket stress test — ramp 0→10→0 VUs over 3 min.
// Each VU opens a Socket.IO connection, holds 30-60s, sends heartbeats + activity events.
// Run: npm run websocket:cds

import { sleep } from 'k6'
import { authHeaders, isLoggedIn, getUser } from './lib/cds-auth.js'
import { openWebSocket } from './lib/cds-websocket.js'
import { logoutAllDoctors } from './lib/cds-workflow.js'

const USERS = JSON.parse(open('../users.json')).users
const MAX_VUS = parseInt(__ENV.MAX_VUS || '0')
const VU_COUNT = MAX_VUS > 0 ? Math.min(MAX_VUS, USERS.length) : USERS.length

export const options = {
  scenarios: {
    websocket: {
      executor:    'ramping-vus',
      startVUs:    0,
      stages: [
        { duration: '30s', target: VU_COUNT },
        { duration: '2m',  target: VU_COUNT },
        { duration: '30s', target: 0 },
      ],
      exec: 'wsFlow',
    },
  },
  thresholds: {
    cds_ws_connect_duration: ['p(95)<2000'],
    cds_ws_ping_duration:    ['p(95)<1000'],
    cds_ws_connect_success:  ['rate>0.90'],
  },
}

export function wsFlow() {
  const h = authHeaders()
  if (!isLoggedIn()) { sleep(1); return }

  const user = getUser()
  const token = h.token

  // Hold connection 30-60s with activity events
  const durationSec = 30 + Math.floor(Math.random() * 30)
  openWebSocket(token, durationSec, 'dashboard_review')

  sleep(1)
}

export function setup() {
  console.log(`Starting WebSocket test — ${VU_COUNT} VUs`)
}

export function teardown() {
  logoutAllDoctors(USERS, VU_COUNT)
  console.log('WebSocket test complete')
}
