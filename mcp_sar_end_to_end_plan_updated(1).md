# MCP SAR — End-to-End Plan (Updated for Bun)

This plan describes how to build the full SAR (Search and Rescue) disaster response system: backend (AWS + Lambda + DynamoDB + Bedrock Nova Lite), MCP middleware, and frontend (Next.js + Tailwind + shadcn, running with **Bun**). The focus is on testing end-to-end flows with clear responses and moving toward frontend integration.

---

## Phase 1 — AWS Backend Foundation

### Components
- **DynamoDB Table** `Events`
  - PK: `eventId` (string)
  - Attributes: `text`, `lat`, `lon`, `createdAt`, `mediaUrl`, `severity`, `trust`, `rationale`

- **Lambda Functions (Node.js 22 runtime)**
  - `/ingest`: Store new event (BM/EN text ok). Adds random severity/trust stub values.
  - `/events`: List all events.
  - `/events/{id}/explain`: Calls **Bedrock Nova Lite** to generate rationale/cues/trust.
  - `/routes/alt`: Stub alt-route generator.
  - `/alerts/geofence`: Stub geofence deliver=1.
  - `/simulate/replay`: Seeds multiple demo events.

- **API Gateway (HTTP)**
  - Connects to Lambdas above.
  - Region: `ap-southeast-1` (Singapore).

- **Bedrock Nova Lite**
  - ARN: `arn:aws:bedrock:ap-southeast-1:<acct-id>:inference-profile/apac.amazon.nova-lite-v1:0`
  - Invocation via `ConverseCommand` with `responseMimeType: application/json`.

### IAM & Policies
- Grant `bedrock:InvokeModel` + `dynamodb:GetItem/PutItem/Scan` to Lambda role.
- Ensure **no SCP explicit deny** for Bedrock actions.

### Sample Responses
- `POST /ingest`
  ```json
  { "eventId": "uuid-1234" }
  ```
- `GET /events`
  ```json
  {
    "events": [
      { "eventId": "uuid-1234", "text": "Banjir kilat di Klang area!", "severity": 78, "trust": 89, "rationale": "Stub: classification placeholder" }
    ]
  }
  ```
- `GET /events/{id}/explain`
  ```json
  {
    "eventId": "uuid-1234",
    "rationale": "Flash flood detected in Klang area.",
    "cues": ["banjir kilat", "Klang"],
    "trustScore": 85,
    "trace": [ { "tool": "explainFn", "ms": 40 }, { "tool": "nova-lite", "ms": 420 } ]
  }
  ```

---

## Phase 2 — MCP Middleware

### Purpose
Bridge between API Gateway and Model Context Protocol clients.

### Bun Implementation
- **Install deps**
  ```bash
  bun add dotenv node-fetch zod @modelcontextprotocol/sdk
  ```

- **Run server**
  ```bash
  bun run server.mjs
  ```

- **Test with JSON-RPC**
  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | bun run server.mjs
  ```

### Available Tools
- `ingest_event` → POST /ingest
- `list_events` → GET /events
- `explain_event` → GET /events/{id}/explain
- `alt_route` → POST /routes/alt
- `set_geofence_alert` → POST /alerts/geofence
- `simulate_replay` → POST /simulate/replay

### Expected Output Example
```json
{
  "result": {
    "tools": [
      { "name": "ingest_event", "description": "Create a new disaster report event..." },
      { "name": "list_events", "description": "List recent events..." }
    ]
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

---

## Phase 3 — Frontend (Next.js + Tailwind + shadcn, with Bun)

### Stack
- **Next.js 15 (App Router)** with Bun runtime.
- **TailwindCSS** for responsive styling.
- **shadcn/ui** for polished components.
- **React Query** (TanStack) for API integration.
- **Maplibre / Leaflet** for maps & geofences.

### Setup
```bash
bun create next-app frontend
cd frontend
bun add tailwindcss postcss autoprefixer @tanstack/react-query @radix-ui/react-dialog lucide-react
npx tailwindcss init -p
```

### Core Features
- **Event Feed Page**: fetch from `/events`.
- **Event Detail Page**: fetch from `/events/{id}/explain`.
- **Ingest Form**: post to `/ingest`.
- **Map View**: display markers from events.
- **Geofence Alerts**: stubbed results from `/alerts/geofence`.

### Example API Call (React Query)
```ts
const { data } = useQuery({
  queryKey: ['events'],
  queryFn: () => fetch('/api/events').then(r => r.json())
});
```

---

## Phase 4 — Integration Testing & Demo

1. **Smoke Test** with curl
   ```bash
   curl -X POST $API_BASE/ingest -d '{"text":"Banjir kilat di Klang area!"}' -H 'content-type: application/json'
   curl $API_BASE/events
   curl $API_BASE/events/<id>/explain
   ```

2. **MCP Test** with JSON-RPC via Bun
   ```bash
   echo '{"jsonrpc":"2.0","id":2,"method":"ingest_event","params":{"text":"Test flood event"}}' | bun run server.mjs
   ```

3. **Frontend Test**
   - Open Next.js app at `http://localhost:3000`
   - Submit event, check list & detail pages.

---

## Deliverables by End of Plan
- AWS backend fully functional (ingest, events, explain via Nova Lite).
- MCP middleware accessible via Bun + JSON-RPC.
- Frontend Next.js app styled with Tailwind + shadcn.
- Demo workflow: Ingest → Classify → Explain → Visualize on map.

---

