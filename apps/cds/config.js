// CDS (ecg.tricog.com) — App Configuration
// All scripts in apps/cds/ read from here only.
// DO NOT import this from other apps.

export const BASE_URL = __ENV.BASE_URL || 'https://uat-ecg.tricogdev.net'

export const APP_HEADER = 'ECG'

export const DEFAULT_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'clientdevicetype': 'Linux x86_64',
  'clientos': 'INSTA_ECG_VIEWER',
  'clientosversion': '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'clientversion': '0.14.4',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'token': '',
}

export const AUTH = {
  loginEndpoint: '/api/v2/login',
  loginBody: {
    domainId: 'Uatdomain3',
    username: 'Karnan',
    password: 'tricog123',
    application: 'INSTA_ECG_VIEWER',
    appVersion: '3.0.0',
  },
  tokenPath: 'token',
}

// WAF domain filter — matches sheet names in Excel
export const WAF_DOMAIN_FILTER = 'ecg'

// Thresholds — adjust once Datadog baseline is available
export const THRESHOLDS = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<3000', 'p(99)<5000'],
}
