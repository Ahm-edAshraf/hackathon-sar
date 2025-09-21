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

async function fetchJson<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(input, {
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
  return fetchJson<ListEventsResponse>('/api/events');
}

export function ingestEvent(payload: IngestEventRequest) {
  return fetchJson<IngestEventResponse>('/api/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function explainEvent(eventId: string) {
  return fetchJson<ExplainEventResponse>(`/api/events/${encodeURIComponent(eventId)}/explain`);
}

export function requestAltRoute(payload: AltRouteRequest) {
  return fetchJson<AltRouteResponse>('/api/routes/alt', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setGeofenceAlert(payload: GeofenceRequest) {
  return fetchJson<GeofenceResponse>('/api/alerts/geofence', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function simulateReplay() {
  return fetchJson<SimulateReplayResponse>('/api/simulate/replay', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
