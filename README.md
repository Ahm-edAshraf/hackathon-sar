# SAR Mission Console

Bun-powered MCP middleware + a polished Next.js dashboard that surfaces live search-and-rescue events from the AWS backend.

## Prerequisites

- Bun 1.2+
- Node 18+
- Environment variable `SAR_API_BASE` pointing to your API Gateway stage (example: `https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod`).
- Google Maps access for the alternate route workflow — set `GOOGLE_MAPS_API_KEY` to a Maps Routes-enabled key.

Create a `.env.local` with:

```env
SAR_API_BASE=https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod
GOOGLE_MAPS_API_KEY=YOUR-GOOGLE-MAPS-KEY
```

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the Next.js dashboard (App Router + Tailwind + shadcn/ui). |
| `bun run build` | Production build using Turbopack. |
| `bun run lint` | Lint the project. |
| `bun run mcp` | Launch the Bun-based MCP middleware over stdio. |

## MCP Middleware

Located in `mcp/server.mjs`, the middleware exposes the SAR backend via Model Context Protocol tools:

- `ingest_event`
- `list_events`
- `explain_event`
- `alt_route`
- `set_geofence_alert`
- `simulate_replay`

Run it against the live backend:

```bash
API_BASE=$SAR_API_BASE bun run mcp/server.mjs \
  <<<'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Frontend Overview

- **Dashboard:** ingest events, fire geofence alerts, request alternate routes, and visualise incidents on an interactive Leaflet map with live metrics.
- **Live status strip:** immediate readouts for API health, last sync, and classification coverage surfaced in the hero band.
- **Mission map controls:** severity legend, overlay toggles, and map-assisted coordinate picking that pipe selections straight into form fields.
- **Operational feed filters:** quick severity/status filters to triage large incident drops.
- **Activity timeline:** audit of recent MCP-triggered automations (ingest, routing, geofence, replay) with success/error signals.
- **Event Detail:** dedicated route (`/events/[eventId]`) showing Nova Lite rationale, trust score, cue tags, trace timeline, and a map spotlight.
- **AI verdict visuals:** rationale card now couples actionable signals with a radial trust gauge for at-a-glance model confidence.
- **Data Access:** Next.js API routes proxy all calls to the AWS backend using `SAR_API_BASE`, ensuring CORS-safe access for the client.
- **UX Enhancements:** theme toggle, gradient hero, toast feedback, responsive cards, and React Query for smart caching + refetching.

## Testing the Flow

1. Start the dashboard: `bun run dev`.
2. Confirm the event feed populates (use "Demo replay" if you need seed data).
3. Submit a new incident via the Report tab and watch it appear in the feed + mission map.
4. Open any event to review the Nova Lite explanation at `/events/<id>`.
5. Keep the MCP server handy for CLI-driven smoke tests.

## Tech Stack

- Next.js 15 App Router with Bun runtime
- Tailwind CSS + shadcn/ui + lucide icons
- React Query (TanStack) + Zod + React Hook Form
- Leaflet / React Leaflet for mapping
- Bun MCP SDK for tool exposure

Happy coordinating!
