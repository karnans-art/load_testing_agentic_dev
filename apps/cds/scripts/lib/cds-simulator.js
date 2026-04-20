// CDS — Simulator Module
// Loads all ECG fixture files and rotates through them on each push.
// Each file has a unique patient/case — prevents repeat case stickiness.

import http from 'k6/http'
import { check } from 'k6'

const ADMIN_URL = __ENV.SIMULATOR_ADMIN_URL || 'https://uat-admin.tricogdev.net'
const ADMIN_COOKIE = __ENV.TRICOG_ADMIN_COOKIE || ''

// Pre-load all ECG files in init context (required by k6)
const CSI_FILES = [
  { name: '087bc1ac.csi', data: open('../../fixtures/087bc1ac-cdea-42ca-af0d-482fb26ffe6e.csi', 'b') },
  { name: '0abf6a7e.csi', data: open('../../fixtures/0abf6a7e-9e4e-44d0-bbbe-57265f97f84d.csi', 'b') },
  { name: '0cba4de1.csi', data: open('../../fixtures/0cba4de1-e4d2-4e1a-baf5-f0c2ee31ea36.csi', 'b') },
  { name: '0cbc248b.csi', data: open('../../fixtures/0cbc248b-7ddd-4e67-b00d-b696ebfabbf6.csi', 'b') },
  { name: '0ded45a3.csi', data: open('../../fixtures/0ded45a3-5619-48b8-9085-d6fefa0acdfb.csi', 'b') },
  { name: '0fc2abf7.csi', data: open('../../fixtures/0fc2abf7-fca5-43a7-b0a4-e3530e6e80f9.csi', 'b') },
  { name: '2485b008.csi', data: open('../../fixtures/2485b008-89d2-48ce-8e7d-92b74c545bdb.csi', 'b') },
  { name: '2f905818.csi', data: open('../../fixtures/2f905818-40c3-4285-abcd-93a0554a5a00.csi', 'b') },
  { name: '34c54c9e.csi', data: open('../../fixtures/34c54c9e-bdc6-4dc1-8257-00ac2f8cb6fb.csi', 'b') },
  { name: '39e13e81.csi', data: open('../../fixtures/39e13e81-fa12-43bc-96fa-877b32436cf6.csi', 'b') },
  { name: '3ddd7413.csi', data: open('../../fixtures/3ddd7413-1528-4917-acac-a984f1c25e4c.csi', 'b') },
  { name: '454e4481.csi', data: open('../../fixtures/454e4481-71f9-4c8b-8bc6-cab22fa87c2d.csi', 'b') },
  { name: '4c6c1b0e.csi', data: open('../../fixtures/4c6c1b0e-1063-4d6b-8099-9922d4b8ef3d.csi', 'b') },
  { name: '511ebcd5.csi', data: open('../../fixtures/511ebcd5-0900-42cb-894e-599832eea08a.csi', 'b') },
  { name: '6bb75c1a.csi', data: open('../../fixtures/6bb75c1a-6587-41b4-90d0-5f310d895f4f.csi', 'b') },
  { name: '73627045.csi', data: open('../../fixtures/73627045-90b1-4f96-8329-1669f5dbc450.csi', 'b') },
  { name: '83a3e8ac.csi', data: open('../../fixtures/83a3e8ac-4d7d-4259-abfc-5692e3c0be70.csi', 'b') },
  { name: '84894e47.csi', data: open('../../fixtures/84894e47-e5dc-4df4-9817-a0ad66ee59b9.csi', 'b') },
  { name: '892cefc3.csi', data: open('../../fixtures/892cefc3-bb02-49da-84ef-9bd3e4efb814.csi', 'b') },
  { name: '8cc68b31.csi', data: open('../../fixtures/8cc68b31-c4d7-4f6b-ac1a-2571c8c18a75.csi', 'b') },
  { name: 'a615eba6.csi', data: open('../../fixtures/a615eba6-a2a8-41ec-a838-222879ca0694.csi', 'b') },
  { name: 'be74591d.csi', data: open('../../fixtures/be74591d-e78d-456a-b71a-67136aa049de.csi', 'b') },
  { name: 'c7c31274.csi', data: open('../../fixtures/c7c31274-e665-4e5f-ab8d-8858dd41f835.csi', 'b') },
  { name: 'd3321e69.csi', data: open('../../fixtures/d3321e69-5a53-4a32-ab9d-93408ee57f1d.csi', 'b') },
  { name: 'd4df5bb6.csi', data: open('../../fixtures/d4df5bb6-2990-4c9c-94d7-9c52dcec06ef.csi', 'b') },
  { name: 'da8ef2f6.csi', data: open('../../fixtures/da8ef2f6-7184-451c-bedb-8951353b7244.csi', 'b') },
  { name: 'dc808eca.csi', data: open('../../fixtures/dc808eca-4b30-46ed-bbba-81c196b992fc.csi', 'b') },
  { name: 'edd318b7.csi', data: open('../../fixtures/edd318b7-55db-4349-a431-a7e3507f91e8.csi', 'b') },
  { name: 'eee5b917.csi', data: open('../../fixtures/eee5b917-8123-4e4d-a2cd-53745b6242b2.csi', 'b') },
  { name: 'f59002da.csi', data: open('../../fixtures/f59002da-530b-4ec4-bea9-6aff941f103f.csi', 'b') },
  { name: 'f79cc9c6.csi', data: open('../../fixtures/f79cc9c6-1f1e-4c2c-862d-b4e959052ee3.csi', 'b') },
  { name: 'f7ed8d32.csi', data: open('../../fixtures/f7ed8d32-b0f8-4683-92f9-81b2cf46a554.csi', 'b') },
  { name: 'fffc747c.csi', data: open('../../fixtures/fffc747c-1232-41f4-8921-ce506acec315.csi', 'b') },
]

let _pushCounter = 0

/**
 * Push a unique ECG case via the simulator.
 * Rotates through all fixture files to avoid repeat case stickiness.
 */
export function simulatorPush() {
  const fileIdx = _pushCounter % CSI_FILES.length
  _pushCounter++
  const csi = CSI_FILES[fileIdx]

  const res = http.post(`${ADMIN_URL}/api/case/simulator`, {
    centerId:  '3520',
    caseType:  'RESTING',
    clientUrl: 'http://cloud-server/simulate',
    deviceId:  'HE-BE68A686',
    file:      http.file(csi.data, csi.name, 'application/octet-stream'),
  }, {
    headers: {
      'cookie':          ADMIN_COOKIE,
      'x-custom-header': 'foobar',
    },
    tags: { name: 'simulator' },
  })

  const ok = check(res, { 'simulator push ok': (r) => r.status >= 200 && r.status < 300 })
  if (!ok) {
    console.error(`Simulator push failed: ${res.status} — ${res.body?.slice(0, 200)}`)
  }
}
