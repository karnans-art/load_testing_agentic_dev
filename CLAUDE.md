# Agentic Load Testing Platform — Constitution

## Purpose
Simulate production traffic from real data (WAF logs + HAR files) across multiple products.
Each product (app) is tested independently. Results reveal bottlenecks across the full infrastructure.

## Products
| App | Status | WAF Logs | HAR File |
|-----|--------|----------|----------|
| cds | active | apps/cds/waf-logs/ | apps/cds/har-files/ |

_Add new products by creating `apps/<product-name>/` with the same structure._

## Core Principles

### I. Production-Rate Simulation
Every endpoint is called at its EXACT proportional rate from WAF logs.
Never equal distribution. Never random blasting.

### II. App Isolation
Each app under `apps/` is completely self-contained.
- NO imports from other apps
- Each app has its own config, scripts, discovered data
- Shared infra lives in `runner/` only (parser, generator, executor)

### III. Real Params from Real Responses
No hardcoded payloads. No fake data.
- Login first → get real token
- Hit each endpoint → capture real request/response
- Use captured payloads in k6 scripts

### IV. Smart Agent Behavior
Agent WARNS, EXPLAINS, and ASKS — never silently fails.
- HAR missing → warn + proceed with WAF + codebase discovery
- null user_agent → evaluate by hit count + URI pattern (NOT auto-skip)
- Conflicting data → prefer HAR over codebase schema

### V. User Agent Filter
INCLUDE: Mozilla, Chrome, Safari, Firefox, Edge, Mobile Safari, null (evaluate)
SKIP: curl/, python-requests, bot, crawler, spider, scrapy, wget, Go-http-client

For null user_agent:
- High hits (>1000) + POST/PUT/DELETE + business URI → INCLUDE
- Low hits (<50) + /health /ping /metrics /internal → SKIP
- Everything else → INCLUDE with WARNING

### VI. Execution Modes
- Local: `k6 run` — development and smoke testing
- Cloud: `k6 run --out cloud` — dashboards + historical comparison (requires K6_CLOUD_TOKEN)
- Dual: `k6 run --out cloud --out statsd` — cloud dashboards + Datadog infra correlation
- CI/CD: post-deploy smoke → production-load → report to Slack/Teams

### VII. One-Time Discovery
Scan codebase ONCE → save to `apps/<name>/discovered/`
Re-scan only when endpoints change.
`runner/run.js` reads discovered JSON directly on subsequent runs.

## Workflow
```
INGEST  → Parse WAF Excel + HAR file
ANALYZE → Calculate hit ratios → RPS per endpoint
DISCOVER→ Hit real API → capture payloads (one-time)
GENERATE→ Write k6 scripts with rate-matched scenarios
EXECUTE → Run k6 local or cloud
REPORT  → Bottleneck analysis + Datadog push (optional)
```

## Adding a New Product
1. `mkdir -p apps/<name>/waf-logs apps/<name>/har-files apps/<name>/discovered apps/<name>/scripts apps/<name>/reports`
2. Copy `apps/cds/config.js` → `apps/<name>/config.js` and update values
3. Drop WAF Excel in `apps/<name>/waf-logs/`
4. Drop HAR file in `apps/<name>/har-files/` (optional)
5. Run: `node runner/run.js --app <name>`
