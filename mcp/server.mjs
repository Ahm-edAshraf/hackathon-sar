import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from '../node_modules/@modelcontextprotocol/sdk/node_modules/zod/index.js';

const API_BASE = process.env.API_BASE;

if (!API_BASE) {
  console.error('Missing API_BASE env var. Set API_BASE to the API Gateway base URL.');
  process.exit(1);
}

const server = new McpServer({
  name: 'sar-mcp',
  version: '0.2.0',
});

const transport = new StdioServerTransport();

const ingestEventArgs = {
  text: z.string().min(3, 'text must be at least 3 characters'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  mediaUrl: z.string().url().optional(),
};

const explainEventArgs = {
  eventId: z.string().min(1, 'eventId is required'),
};

const altRouteArgs = {
  originLat: z.number().default(3.043),
  originLon: z.number().default(101.449),
  destLat: z.number().default(3.155),
  destLon: z.number().default(101.712),
};

const geofenceArgs = {
  lat: z.number().default(3.043),
  lon: z.number().default(101.449),
  radiusKm: z.number().default(1),
};

const BASE_URL = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;

function toRelativePath(path) {
  return path.startsWith('/') ? path.slice(1) : path;
}

async function httpJson(path, { method = 'GET', body, headers = {} } = {}) {
  const relativePath = toRelativePath(path);
  const url = new URL(relativePath, BASE_URL);
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request to ${url.pathname} failed: ${response.status} ${response.statusText}
${text}`);
  }

  return await response.json();
}

function jsonToolResult(payload) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    structuredContent: payload,
  };
}

server.registerTool(
  'ingest_event',
  {
    title: 'Ingest Event',
    description: 'Create a new disaster event report in the SAR system.',
    inputSchema: ingestEventArgs,
  },
  async (input) => {
    const result = await httpJson('/ingest', { method: 'POST', body: input });
    return jsonToolResult(result);
  }
);

server.registerTool(
  'list_events',
  {
    title: 'List Events',
    description: 'Retrieve the catalog of recent disaster events.',
  },
  async () => {
    const result = await httpJson('/events');
    return jsonToolResult(result);
  }
);

server.registerTool(
  'explain_event',
  {
    title: 'Explain Event',
    description: 'Fetch the Nova Lite rationale for a specific event.',
    inputSchema: explainEventArgs,
  },
  async ({ eventId }) => {
    const result = await httpJson(`/events/${encodeURIComponent(eventId)}/explain`);
    return jsonToolResult(result);
  }
);

server.registerTool(
  'alt_route',
  {
    title: 'Generate Alternate Route',
    description: 'Request a detour route between two coordinate pairs.',
    inputSchema: altRouteArgs,
  },
  async (input) => {
    const result = await httpJson('/routes/alt', { method: 'POST', body: input });
    return jsonToolResult(result);
  }
);

server.registerTool(
  'set_geofence_alert',
  {
    title: 'Set Geofence Alert',
    description: 'Deliver a geofence alert for responders within a radius.',
    inputSchema: geofenceArgs,
  },
  async (input) => {
    const result = await httpJson('/alerts/geofence', { method: 'POST', body: input });
    return jsonToolResult(result);
  }
);

server.registerTool(
  'simulate_replay',
  {
    title: 'Simulate Event Replay',
    description: 'Trigger the backend to replay demo SAR events.',
  },
  async () => {
    const result = await httpJson('/simulate/replay', { method: 'POST', body: {} });
    return jsonToolResult(result);
  }
);

async function main() {
  try {
    console.error('SAR MCP server starting (stdio)...');
    await server.connect(transport);
    console.error('SAR MCP server ready.');
  } catch (error) {
    console.error('Fatal MCP server error:', error);
    process.exit(1);
  }
}

main();
