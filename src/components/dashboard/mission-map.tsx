'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';
import { Navigation, Pin } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { decodeGooglePolyline } from '@/lib/polyline';
import type { SarEvent } from '@/types/sar';
import { formatCoordinate, formatEventTimestamp, getSeverityMeta } from '@/lib/event-utils';
import type { RoutePlanPayload } from './operations-panel';

interface MissionMapProps {
  events?: SarEvent[];
  selectedEventId?: string | null;
  onSelect: (eventId: string) => void;
  routePlan?: RoutePlanPayload | null;
}

const DEFAULT_CENTER: LatLngTuple = [3.089, 101.586];

export function MissionMap({ events = [], selectedEventId, onSelect, routePlan }: MissionMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [leaflet, setLeaflet] = useState<null | typeof import('react-leaflet')>(null);

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
    const allPoints: LatLngTuple[] = [
      ...markers.map((marker) => marker.position),
      ...routePath,
      ...routeAnchors,
    ];
    if (!allPoints.length) {
      return;
    }
    const latitudes = allPoints.map((point) => point[0]);
    const longitudes = allPoints.map((point) => point[1]);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    mapRef.current.fitBounds(
      [
        [minLat, minLon],
        [maxLat, maxLon],
      ],
      { maxZoom: 13, padding: [40, 40] },
    );
  }, [markers, routePath, routeAnchors]);

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

  const { MapContainer, TileLayer, CircleMarker, Popup, Polyline } = leaflet;

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
        <div className="h-[28rem]">
          <MapContainer
            center={defaultCenter}
            zoom={12}
            scrollWheelZoom
            className="h-full w-full"
            ref={(instance) => {
              mapRef.current = instance ?? null;
            }}
          >
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {routePlan && routePath.length >= 2 ? (
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

            {markers.length === 0
              ? null
              : markers.map(({ position, event }) => {
                  const severity = getSeverityMeta(event.severity);
                  const isSelected = event.eventId === selectedEventId;
                  return (
                    <CircleMarker
                      key={event.eventId}
                      center={position}
                      radius={isSelected ? 12 : 8}
                      pathOptions={{
                        color: isSelected ? '#2563eb' : '#f97316',
                        fillOpacity: 0.7,
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
