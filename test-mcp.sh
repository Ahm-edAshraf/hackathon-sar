#!/bin/bash

set -euo pipefail

# MCP Server Test Script
# Ensure API_BASE is exported, e.g.:
# export API_BASE=https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod

echo "🧪 Testing MCP Server..."
echo "API_BASE: ${API_BASE:-<unset>}"
echo

if [ -z "${API_BASE:-}" ]; then
  echo "❌ Error: API_BASE environment variable is not set!"
  echo "Please run: export API_BASE=https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod"
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "❌ Error: bun is not available in PATH."
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  use_jq=true
else
  use_jq=false
  echo "ℹ️  jq not found — responses will not be prettified."
fi

run_mcp() {
  local payload="$1"
  printf '%s\n' "$payload" | bun run mcp/server.mjs
}

pretty() {
  if [ "$use_jq" = true ]; then
    jq '.'
  else
    cat
  fi
}

# 1. tools/list ---------------------------------------------------------------
echo "1️⃣  tools/list"
run_mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | {
  if [ "$use_jq" = true ]; then jq '.result.tools[].name'; else cat; fi
}
echo

# 2. list_events --------------------------------------------------------------
echo "2️⃣  list_events"
LIST_RESPONSE=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_events","arguments":{}}}')
if [ "$use_jq" = true ]; then
  echo "$LIST_RESPONSE" | jq '{count: (.result.structuredContent.events | length), firstEvent: (.result.structuredContent.events[0] // null)}'
else
  echo "$LIST_RESPONSE"
fi
echo

# 3. ingest_event -------------------------------------------------------------
echo "3️⃣  ingest_event"
INGEST_RESPONSE=$(run_mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ingest_event","arguments":{"text":"MCP Test Event","lat":3.033,"lon":101.45}}}')
echo "$INGEST_RESPONSE" | pretty
EVENT_ID=$(echo "$INGEST_RESPONSE" | jq -r '.result.structuredContent.eventId' 2>/dev/null || true)
if [ -n "$EVENT_ID" ] && [ "$EVENT_ID" != "null" ]; then
  echo "Captured eventId: $EVENT_ID"
else
  EVENT_ID=""
  echo "⚠️  Could not capture eventId; explain_event test will be skipped."
fi
echo

# 4. explain_event ------------------------------------------------------------
if [ -n "$EVENT_ID" ]; then
  echo "4️⃣  explain_event"
  EXPLAIN_PAYLOAD=$(cat <<EOF
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"explain_event","arguments":{"eventId":"$EVENT_ID"}}}
EOF
)
  run_mcp "$EXPLAIN_PAYLOAD" | pretty
  echo
fi

# 5. alt_route ----------------------------------------------------------------
echo "5️⃣  alt_route"
ALT_ROUTE_PAYLOAD='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"alt_route","arguments":{"originLat":3.135,"originLon":101.666,"destLat":3.155,"destLon":101.712}}}'
run_mcp "$ALT_ROUTE_PAYLOAD" | pretty
echo

# 6. set_geofence_alert -------------------------------------------------------
echo "6️⃣  set_geofence_alert"
GEOFENCE_PAYLOAD='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"set_geofence_alert","arguments":{"lat":3.13,"lon":101.65,"radiusKm":2}}}'
run_mcp "$GEOFENCE_PAYLOAD" | pretty
echo

# 7. simulate_replay ----------------------------------------------------------
echo "7️⃣  simulate_replay"
run_mcp '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"simulate_replay","arguments":{}}}' | pretty
echo

echo "✅ MCP testing complete!"
