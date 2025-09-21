'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';
import { Navigation, Pin } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { decodeGooglePolyline } from '@/lib/polyline';
import type { SarEvent } from '@/types/sar';
import { formatCoordinate, formatEventTimestamp, getSeverityMeta } from '@/lib/event-utils';
import type { RoutePlanPayload, CoordinateSelectionRequest } from './operations-panel';

interface MissionMapProps {
  events?: SarEvent[];
  selectedEventId?: string | null;
  onSelect: (eventId: string) => void;
  routePlan?: RoutePlanPayload | null;
  coordinateRequest?: CoordinateSelectionRequest | null;
  onCoordinatePick?: (coords: { lat: number; lon: number }) => void;
}

const DEFAULT_CENTER: LatLngTuple = [3.089, 101.586];

export function MissionMap({
  events = [],
  selectedEventId,
  onSelect,
  routePlan,
  coordinateRequest,
  onCoordinatePick,
}: MissionMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [leaflet, setLeaflet] = useState<null | typeof import('react-leaflet')>(null);
  const [displayMode, setDisplayMode] = useState<'severity' | 'simple'>('severity');
  const [showRouteOverlay, setShowRouteOverlay] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selectionPreview, setSelectionPreview] = useState<LatLngTuple | null>(null);

  useEffect(() => {
    let mounted = true;
    import('react-leaflet')
      .then((mod) => {
        if (mounted) {
          setLeaflet(mod);
        }
      })
      .catch((error) => {
        console.error('Failed to load react-leaflet', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const markers = useMemo(() => {
    if (!events.length) {
      return [] as Array<{ position: LatLngTuple; event: SarEvent }>;
    }

    return events
      .filter((event) => typeof event.lat === 'number' && typeof event.lon === 'number')
      .map((event) => ({ position: [event.lat as number, event.lon as number] as LatLngTuple, event }));
  }, [events]);

  const routeAnchors = useMemo<LatLngTuple[]>(() => {
    if (!routePlan) {
      return [];
    }
    return [
      [routePlan.origin.lat, routePlan.origin.lon] as LatLngTuple,
      [routePlan.destination.lat, routePlan.destination.lon] as LatLngTuple,
    ];
  }, [routePlan]);

  const routePath = useMemo<LatLngTuple[]>(() => {
    const encoded = routePlan?.summary.polyline;
    if (encoded) {
      const decoded = decodeGooglePolyline(encoded);
      if (decoded.length) {
        return decoded.map(([lat, lon]) => [lat, lon] as LatLngTuple);
      }
    }
    return routeAnchors;
  }, [routePlan, routeAnchors]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    let boundsPoints: LatLngTuple[] = [];
    if (routePath.length >= 2) {
      boundsPoints = routePath;
    } else if (markers.length) {
      boundsPoints = markers.map((marker) => marker.position);
    }

    if (!boundsPoints.length) {
      return;
    }

    mapRef.current.fitBounds(boundsPoints, {
      maxZoom: routePath.length >= 2 ? 12 : 13,
      padding: [48, 48],
    });
  }, [markers, routePath]);

  useEffect(() => {
    if (coordinateRequest) {
      setSelectionPreview(null);
    }
  }, [coordinateRequest]);

  const selectedMarker = markers.find((marker) => marker.event.eventId === selectedEventId);
  const defaultCenter = useMemo<LatLngTuple>(() => {
    if (selectedMarker) {
      return selectedMarker.position;
    }
    if (routePath.length) {
      const midpointIndex = Math.floor(routePath.length / 2);
      return routePath[midpointIndex];
    }
    if (routeAnchors.length === 2) {
      return [
        (routeAnchors[0][0] + routeAnchors[1][0]) / 2,
        (routeAnchors[0][1] + routeAnchors[1][1]) / 2,
      ] as LatLngTuple;
    }
    return DEFAULT_CENTER;
  }, [selectedMarker, routePath, routeAnchors]);

  if (!leaflet) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg font-semibold">Mission Map</CardTitle>
            <p className="text-sm text-muted-foreground">Initialising map tiles…</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <Pin className="h-3.5 w-3.5" /> Loading
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[28rem] w-full animate-pulse bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMapEvents } = leaflet;

  const ClickHandler = () => {
    useMapEvents({
      click(event) {
        const coords = { lat: event.latlng.lat, lon: event.latlng.lng };
        setSelectionPreview([coords.lat, coords.lon]);
        onCoordinatePick?.(coords);
      },
    });
    return null;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-semibold">Mission Map</CardTitle>
          <p className="text-sm text-muted-foreground">
            {markers.length ? `${markers.length} plotted event${markers.length === 1 ? '' : 's'}` : 'Awaiting coordinates'}
          </p>
        </div>
        {selectedMarker ? (
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            <Navigation className="h-3.5 w-3.5" /> Tracking {selectedMarker.event.eventId.slice(0, 6)}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <Pin className="h-3.5 w-3.5" /> No event selected
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[28rem]">
          <div className="absolute right-4 top-4 z-[1000] flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2 rounded-full bg-background/80 px-2 py-1 shadow-sm">
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  'h-8 rounded-full px-3 text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary',
                  displayMode === 'severity' && 'bg-primary/10 text-primary shadow-sm',
                )}
                onClick={() => setDisplayMode(displayMode === 'severity' ? 'simple' : 'severity')}
              >
                {displayMode === 'severity' ? 'Severity view' : 'Simple view'}
              </Button>
              {routePlan ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-8 rounded-full px-3 text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary',
                    showRouteOverlay && 'bg-primary/10 text-primary shadow-sm',
                  )}
                  onClick={() => setShowRouteOverlay((value) => !value)}
                >
                  {showRouteOverlay ? 'Route on' : 'Route off'}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  'h-8 rounded-full px-3 text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary',
                  legendOpen && 'bg-primary/10 text-primary shadow-sm',
                )}
                onClick={() => setLegendOpen((value) => !value)}
              >
                {legendOpen ? 'Hide legend' : 'Legend'}
              </Button>
            </div>
            {legendOpen ? <SeverityLegend align="right" /> : null}
          </div>
          {coordinateRequest ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[1000] mx-auto w-fit rounded-full bg-background/80 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm">
              Tap map to set {coordinateRequest.label}
            </div>
          ) : null}
          <MapContainer
            center={defaultCenter}
            zoom={12}
            scrollWheelZoom
            className={cn('h-full w-full', coordinateRequest ? 'cursor-crosshair' : '')}
            ref={(instance) => {
              mapRef.current = instance ?? null;
            }}
          >
            {coordinateRequest ? (
              <ClickHandler />
            ) : null}
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {routePlan && routePath.length >= 2 && showRouteOverlay ? (
              <>
                <Polyline
                  positions={routePath}
                  pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.85 }}
                />
                {routeAnchors.map((position, index) => (
                  <CircleMarker
                    key={`route-anchor-${index}`}
                    center={position}
                    radius={index === 0 ? 8 : 7}
                    pathOptions={{ color: index === 0 ? '#22d3ee' : '#0ea5e9', fillOpacity: 0.9, weight: 2 }}
                  />
                ))}
              </>
            ) : null}

            {selectionPreview ? (
              <CircleMarker
                center={selectionPreview}
                radius={8}
                pathOptions={{ color: '#0ea5e9', fillOpacity: 0.6, weight: 2 }}
              />
            ) : null}

            {markers.length === 0
              ? null
              : markers.map(({ position, event }) => {
                  const severity = getSeverityMeta(event.severity);
                  const isSelected = event.eventId === selectedEventId;
                  const color = displayMode === 'severity' ? severityToColor(severity.label) : '#2563eb';
                  return (
                    <CircleMarker
                      key={event.eventId}
                      center={position}
                      radius={isSelected ? 12 : 8}
                      pathOptions={{
                        color,
                        fillOpacity: isSelected ? 0.85 : 0.65,
                        weight: isSelected ? 3 : 2,
                      }}
                      eventHandlers={{
                        click: () => onSelect(event.eventId),
                      }}
                    >
                      <Popup>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', severity.className)}>
                              {severity.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatEventTimestamp(event)}</span>
                          </div>
                          <p className="text-sm font-medium leading-relaxed">{event.text}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCoordinate(event.lat)}, {formatCoordinate(event.lon)}
                          </p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityLegend({ align = 'left' }: { align?: 'left' | 'right' }) {
  const entries = [
    { label: 'Critical', color: '#ef4444' },
    { label: 'High', color: '#f97316' },
    { label: 'Elevated', color: '#0ea5e9' },
    { label: 'Low', color: '#22c55e' },
    { label: 'Unknown', color: '#6b7280' },
  ];
  return (
    <div
      className={cn(
        'rounded-2xl border bg-background/90 p-3 shadow-sm',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Severity key</p>
      <ul className="mt-2 space-y-1 text-xs">
        {entries.map((entry) => (
          <li key={entry.label} className={cn('flex items-center gap-2', align === 'right' ? 'justify-end' : 'justify-start')}>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function severityToColor(label: string): string {
  switch (label) {
    case 'Critical':
      return '#ef4444';
    case 'High':
      return '#f97316';
    case 'Elevated':
      return '#0ea5e9';
    case 'Low':
      return '#22c55e';
    default:
      return '#6b7280';
  }
}
