# SAR Mission Console — Full Stack Overview

This document captures the complete architecture of the MCP-driven Search & Rescue MVP so you can translate it into slides and diagrams without hunting through the console. All resources live in **ap-southeast-5 (Jakarta)** unless otherwise noted.

---

## 1. Problem Statement Alignment
- Rapid detection of floods/landslides via social media keywords, cross-checked against weather data.
- Provide alternative routing and geofence alerts to responders.
- Showcase AI usage (Bedrock Nova Lite) and AWS-first implementation.

Our solution surfaces social-era SAR reports, enriches them with AI, exposes the flows through MCP tooling, and visualises mission state in a Next.js console hosted on Amplify.

---

## 2. High-Level Architecture

```
Frontend (Amplify-hosted Next.js)
  │
  ├── calls -> API Gateway (mcp-sar-api)
  │       ├── /events (GET)          -> Lambda getEventsFn -> DynamoDB Events
  │       ├── /ingest (POST)         -> Lambda ingestFn   -> DynamoDB Events
  │       ├── /events/{id}/explain   -> Lambda explainFn  -> Bedrock Nova Lite
  │       ├── /routes/alt (POST)     -> Lambda routesFn   -> Google Maps Routes API
  │       ├── /alerts/geofence (POST)-> Lambda alertsFn   -> (stub) responder notifications
  │       ├── /simulate/replay (POST)-> Lambda replayFn   -> DynamoDB seed events
  │       └── /social/x/pull (POST)  -> Lambda pullTweetsFn (stub datasource)
  │
  └── shares the same APIs with -> Bun MCP middleware (server.mjs)
```

Auxiliary services: CloudWatch Logs for each Lambda, IAM roles for execution, Amplify Hosting for the app, Google Maps API key, `.env` for SAR API Base.

---

## 3. AWS Resources

### 3.1 API Gateway
- **Name:** `mcp-sar-api`
- **Region:** ap-southeast-5
- **Stage:** `prod`
- **Endpoints** (all `ANY` secured via Lambda proxy integrations):
  | Path                       | Method | Lambda           | Notes |
  |---------------------------|--------|------------------|-------|
  | `/events`                 | GET    | `getEventsFn`    | Supports query string filters (`since`, `minSeverity`, `bbox`). |
  | `/events/{id}/explain`    | GET    | `explainFn`      | Calls Bedrock Nova Lite using AWS SDK `ConverseCommand` (response mime JSON). |
  | `/ingest`                 | POST   | `ingestFn`       | Creates event with optional `lat`, `lon`, `mediaUrl`. |
  | `/routes/alt`             | POST   | `routesFn`       | Fetches detour using Google Maps Routes API (stub payload supported for now). |
  | `/alerts/geofence`        | POST   | `alertsFn`       | Stub geofence notifications. |
  | `/simulate/replay`        | POST   | `replayFn`       | Seeds sample events. |
  | `/social/x/pull`          | POST   | `pullTweetsFn`   | Stub hook for social ingestion. |

- **CORS:** Root resource configured with `Access-Control-Allow-Origin` reflecting Amplify domain. Lambda responses also set CORS headers via code: `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`.

### 3.2 Lambda Functions (Node.js 22.x)
All functions share a common execution role (`mcp-sar-lambda-exec`) with permissions:
- DynamoDB `GetItem`, `PutItem`, `Scan` on `Events` table.
- Bedrock `InvokeModel` for Nova Lite.
- CloudWatch Logs (`CreateLogGroup`, `CreateLogStream`, `PutLogEvents`).
- Secrets/Google key accessed via environment variable (no Secrets Manager required for MVP).

| Function       | Purpose / Key Logic | Environment Variables |
|----------------|---------------------|------------------------|
| `getEventsFn`  | Scans `Events` table, applies filters, returns list. Adds CORS headers. | `REGION`, `TABLE_EVENTS`, `CORS_ORIGIN` |
| `ingestFn`     | Writes new event to DynamoDB; stub severity/trust; returns `eventId`. | `REGION`, `TABLE_EVENTS`, `CORS_ORIGIN` |
| `explainFn`    | Looks up event and calls Bedrock Nova Lite; returns rationale, cues, trust. | `REGION`, `TABLE_EVENTS`, `BEDROCK_PROFILE`, `CORS_ORIGIN` |
| `routesFn`     | Calls Google Maps Routes API (HTTP request) to return distance/ETA/polyline. | `REGION`, `GOOGLE_MAPS_API_KEY`, `CORS_ORIGIN` |
| `alertsFn`     | Stubbed geofence delivery count. | `REGION`, `CORS_ORIGIN` |
| `replayFn`     | Seeds multiple demo events into DynamoDB. | `REGION`, `TABLE_EVENTS`, `CORS_ORIGIN` |
| `pullTweetsFn` | Placeholder for Twitter ingest (ensures architecture slot). | `REGION`, `TABLE_EVENTS`, `CORS_ORIGIN` |

### 3.3 DynamoDB
- **Table:** `Events`
- **Primary Key:** `eventId` (String)
- **Attributes Stored:** `text`, `lat`, `lon`, `createdAt`, `mediaUrl`, `severity`, `trust`, `rationale`.
- No secondary indexes required for MVP.

### 3.4 Bedrock
- **Model:** Amazon Nova Lite v1 (apac.amazon.nova-lite-v1:0)
- **Integration:** `explainFn` uses AWS SDK `ConverseCommand` with `responseMimeType: 'application/json'`. Output includes `rationale`, `cues`, `trustScore`, and tool trace array.

### 3.5 Google Maps Routes API
- Called from `routesFn` with key stored in `GOOGLE_MAPS_API_KEY` env var.
- Returns ETA, distance, optional polyline (decoded client-side for map overlay).

### 3.6 Hosting & CI/CD (Amplify)
- Amplify app name: `hackathon-sar` (Next.js SSR + static).
- Repository: `github.com/Ahm-edAshraf/hackathon-sar` (branch `main`).
- Build command: `npm run build` (after `npm install`).
- Environment variables:
  - `SAR_API_BASE=https://kbrn0xnk9j.execute-api.ap-southeast-5.amazonaws.com/prod`
  - `GOOGLE_MAPS_API_KEY=<Maps-Routes-key>`
  - `NEXT_PUBLIC_SAR_API_BASE=https://kbrn0xnk9j.execute-api.ap-southeast-5.amazonaws.com/prod`
- Service role: Amplify-managed deployment role (separate from Lambda exec role).

### 3.7 Observability
- CloudWatch log groups auto-created per Lambda.
- API Gateway execution logs available (not required for MVP but can be enabled).

---

## 4. Frontend & MCP Components

### 4.1 Next.js Mission Console (frontend)
- Stack: Next.js 15 (App Router), React Query, Tailwind + shadcn/ui, Leaflet maps, Bun tooling locally.
- Features: Hero status strip, metrics cards, mission map with severity legend & route overlay, event feed filters, mission control forms (ingest/routing/alerts), automation timeline, theme toggle, event detail route with Nova Lite trust gauge.
- API Client: `NEXT_PUBLIC_SAR_API_BASE` used for direct browser calls; falls back to Next.js API proxy when unset.

### 4.2 Bun MCP Middleware
- File: `mcp/server.mjs` (runs via `bun run mcp/server.mjs`).
- Tools exposed over Model Context Protocol: `list_events`, `ingest_event`, `explain_event`, `alt_route`, `set_geofence_alert`, `simulate_replay`.
- Uses `fetchJson` helper with `API_BASE` env var (same as `SAR_API_BASE`).
- Enables LLM agents (e.g., Claude desktop) to call the backend.

### 4.3 Test Harness
- Script `test-mcp.sh`: sequentially exercises MCP tools (tools/list, list_events, ingest_event, explain_event, alt_route, set_geofence_alert, simulate_replay) with jq pretty-printing. Validates end-to-end connectivity.
- Local development: `bun run dev`, `bun run lint`, `bun run build`.

---

## 5. Data Flow Summary

1. **Ingest Workflow**
   - Analyst fills Mission Control form or MCP `ingest_event` -> API Gateway `/ingest` -> `ingestFn` writes to DynamoDB with severity/trust defaults.
2. **Explain / AI Enrichment**
   - Frontend or MCP calls `/events/{id}/explain` -> `explainFn` fetches item, calls Bedrock Nova Lite, stores rationale/trust, returns to client.
3. **Routing**
   - `/routes/alt` -> `routesFn` hits Google Maps -> returns ETA, distance, polyline for map overlay.
4. **Geofence Alerts**
   - `/alerts/geofence` -> `alertsFn` simulates notification count.
5. **Simulation**
   - `/simulate/replay` -> `replayFn` bulk inserts demo events, used for demos + testing.
6. **Social Intake Stub**
   - `/social/x/pull` -> `pullTweetsFn` placeholder for future ingestion pipeline.

---

## 6. Security & IAM Overview
- Lambda execution role (`mcp-sar-lambda-exec`) grants least privilege for DynamoDB, Bedrock, CloudWatch Logs, and outbound HTTPS.
- Amplify service role handles build + deploy; environment variables supply API keys.
- CORS locked to Amplify origin via `CORS_ORIGIN` env var (or `*` during testing).
- No end-user auth in MVP; API keys not required.

---

## 7. Deployment & Regions
- **Backend Region:** ap-southeast-5 (API Gateway, Lambdas, DynamoDB, Bedrock profile).
- **Frontend Hosting:** AWS Amplify (default region per account, typically us-east-1 but serves globally).
- **MCP CLI:** Runs wherever Bun is available; uses `API_BASE` pointing at the same API Gateway.

---

## 8. Cost Considerations (MVP)
- DynamoDB: on-demand pricing, low volume.
- Lambda: pay-per-invoke; Node 22 small code footprint.
- Bedrock Nova Lite: per-token (limited usage for explanations).
- Google Maps Routes: pay-per-request (demo usage only).
- Amplify Hosting: standard build minutes + hosting tier.

---

## 9. Deliverables Checklist
- Public GitHub repo (`hackathon-sar`).
- Amplify URL: `https://main.d34iqddyu7kcl7.amplifyapp.com`.
- MCP test script output (optional to include in docs).
- Architecture diagram (use sections above as reference).
- Pitch deck referencing AWS services, AI usage, impact.
- Demo video (≤5 min) walking ingest → explain → route → MCP CLI.

---

_Use this document as the canonical reference when building slides, diagrams, and submission materials._
