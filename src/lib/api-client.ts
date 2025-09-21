'use client';

import type {
  AltRouteRequest,
  AltRouteResponse,
  ExplainEventResponse,
  GeofenceRequest,
  GeofenceResponse,
  IngestEventRequest,
  IngestEventResponse,
  ListEventsResponse,
  SimulateReplayResponse,
} from '@/types/sar';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_SAR_API_BASE?.replace(/\/$/, '') ?? null;

function buildUrl(path: string) {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  if (PUBLIC_API_BASE) {
    return `${PUBLIC_API_BASE}/${trimmed}`;
  }
  return `/api/${trimmed}`;
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let details: unknown;
    const text = await response.text();
    try {
      details = text ? JSON.parse(text) : undefined;
    } catch {
      details = text || undefined;
    }
    throw new ApiError(response.statusText || 'Request failed', response.status, details);
  }

  return (await response.json()) as T;
}

export function getEvents() {
  return fetchJson<ListEventsResponse>('events');
}

export function ingestEvent(payload: IngestEventRequest) {
  return fetchJson<IngestEventResponse>('ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function explainEvent(eventId: string) {
  return fetchJson<ExplainEventResponse>(`events/${encodeURIComponent(eventId)}/explain`);
}

export function requestAltRoute(payload: AltRouteRequest) {
  return fetchJson<AltRouteResponse>('routes/alt', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setGeofenceAlert(payload: GeofenceRequest) {
  return fetchJson<GeofenceResponse>('alerts/geofence', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function simulateReplay() {
  return fetchJson<SimulateReplayResponse>('simulate/replay', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
