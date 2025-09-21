export interface SarEvent {
  eventId: string;
  text: string;
  lat?: number;
  lon?: number;
  createdAt?: number;
  mediaUrl?: string;
  severity?: number;
  trust?: number;
  rationale?: string;
}

export interface ListEventsResponse {
  events: SarEvent[];
}

export interface IngestEventRequest {
  text: string;
  lat?: number;
  lon?: number;
  mediaUrl?: string;
}

export interface IngestEventResponse {
  eventId: string;
}

export interface ExplainEventResponse {
  eventId: string;
  rationale: string;
  cues?: string[];
  trustScore?: number;
  trace?: Array<{
    tool: string;
    ms: number;
  }>;
}

export interface AltRouteRequest {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
}

export interface AltRouteLeg {
  distanceMeters?: number;
  duration?: string;
  start?: { latitude?: number; longitude?: number };
  end?: { latitude?: number; longitude?: number };
}

export interface AltRouteResponse {
  distanceKm: number;
  etaMin: number;
  polyline?: string;
  legs?: AltRouteLeg[];
}

export interface GeofenceRequest {
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface GeofenceResponse {
  delivered: number;
}

export interface SimulateReplayResponse {
  started: boolean;
  count: number;
}

export type ExplainTraceStep = ExplainEventResponse["trace"] extends Array<infer Step>
  ? Step
  : { tool: string; ms: number };
