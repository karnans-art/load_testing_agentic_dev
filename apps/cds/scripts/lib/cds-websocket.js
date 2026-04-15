// CDS — Socket.IO WebSocket Handler
// Handles Socket.IO v3 handshake, heartbeat, activity events.
// Used by websocket-test.js and full-doctor-flow.js.

import ws from 'k6/ws'
import { getBaseUrl } from './cds-auth.js'
import {
  wsConnectDuration, wsSessionDuration, wsPingDuration,
  wsMsgsSent, wsMsgsReceived, wsConnectSuccess,
} from './cds-metrics.js'

/**
 * Build Socket.IO WebSocket URL from token.
 */
function buildWsUrl(token) {
  const base = getBaseUrl().replace(/^https:\/\//, 'wss://')
  return `${base}/api/v2/socket.io/?channel=${token}&EIO=3&transport=websocket`
}

/**
 * Open a Socket.IO WebSocket connection, hold for durationSec.
 *
 * @param {string} token          - Auth token (used as WS channel ID)
 * @param {number} durationSec    - How long to hold the connection open
 * @param {string} label          - Activity event label for clickEventEmiter
 * @param {number} clickIntervalMs - ms between simulated click events (default 10s)
 */
export function openWebSocket(token, durationSec, label, clickIntervalMs = 10000) {
  const wsUrl = buildWsUrl(token)
  const connectStart = Date.now()
  const sessionStart = Date.now()

  const res = ws.connect(wsUrl, {}, function (socket) {
    wsConnectDuration.add(Date.now() - connectStart)
    wsConnectSuccess.add(1)
    let pingStart = 0

    socket.on('message', function (msg) {
      wsMsgsReceived.add(1)

      // Socket.IO handshake: server sends "0{...}" → respond with "40" then register
      if (msg.startsWith('0{')) {
        socket.send('40')
        socket.send('42["registerNotification"]')
        wsMsgsSent.add(2)
      }

      // Socket.IO pong: server sends "3"
      if (msg === '3' && pingStart > 0) {
        wsPingDuration.add(Date.now() - pingStart)
        pingStart = 0
      }
    })

    socket.on('error', function () {
      wsConnectSuccess.add(0)
    })

    // Heartbeat every 25s (matches Socket.IO server config)
    socket.setInterval(function () {
      pingStart = Date.now()
      socket.send('2')
      wsMsgsSent.add(1)
    }, 25000)

    // Simulate doctor activity (page interaction events)
    socket.setInterval(function () {
      socket.send(
        `42${JSON.stringify([
          'clickEventEmiter',
          { viewerId: token, doctorname: 'LoadTest', event: label },
        ])}`
      )
      wsMsgsSent.add(1)
    }, clickIntervalMs)

    // Close after duration
    socket.setTimeout(function () {
      wsSessionDuration.add(Date.now() - sessionStart)
      socket.close()
    }, durationSec * 1000)
  })

  return res
}
