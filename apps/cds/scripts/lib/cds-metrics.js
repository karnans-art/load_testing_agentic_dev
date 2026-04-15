// CDS — Centralized Custom Metrics
// Single source of truth for all CDS-specific k6 metrics.
// Import and use across all CDS test scripts.

import { Trend, Counter, Rate } from 'k6/metrics'

// ── Auth ──────────────────────────────────────────────────────
export const loginDuration = new Trend('cds_login_duration', true)

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardLoadDuration = new Trend('cds_dashboard_load_duration', true)
export const taskListDuration = new Trend('cds_task_list_duration', true)
export const taskFilterDuration = new Trend('cds_task_filter_duration', true)

// ── ECG Viewer ────────────────────────────────────────────────
export const ecgViewerLoadDuration = new Trend('cds_ecg_viewer_load_duration', true)

// ── Diagnosis ─────────────────────────────────────────────────
export const caseOpenDuration = new Trend('cds_case_open_duration', true)
export const diagnosisReviewDuration = new Trend('cds_diagnosis_review_duration', true)
export const diagnosisSubmitDuration = new Trend('cds_diagnosis_submit_duration', true)
export const casesProcessedCount = new Counter('cds_cases_processed_count')

// ── Queue / Reports ───────────────────────────────────────────
export const queueCheckDuration = new Trend('cds_queue_check_duration', true)

// ── WebSocket ─────────────────────────────────────────────────
export const wsConnectDuration = new Trend('cds_ws_connect_duration', true)
export const wsSessionDuration = new Trend('cds_ws_session_duration', true)
export const wsPingDuration = new Trend('cds_ws_ping_duration', true)
export const wsMsgsSent = new Counter('cds_ws_msgs_sent')
export const wsMsgsReceived = new Counter('cds_ws_msgs_received')
export const wsConnectSuccess = new Rate('cds_ws_connect_success')

// ── Business Health ───────────────────────────────────────────
export const apiErrorCount = new Counter('cds_api_error_count')
export const apiSuccessRate = new Rate('cds_api_success_rate')
