'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SarEvent } from '@/types/sar';
import { formatCoordinate } from '@/lib/event-utils';

interface EventDetailMapProps {
  event: SarEvent;
}

const DEFAULT_CENTER: [number, number] = [3.089, 101.586];

export function EventDetailMap({ event }: EventDetailMapProps) {
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

  if (typeof event.lat !== 'number' || typeof event.lon !== 'number') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Map view</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          Coordinates unavailable for this event.
        </CardContent>
      </Card>
    );
  }

  if (!leaflet) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Map view</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px] animate-pulse bg-muted/30" />
      </Card>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = leaflet;
  const center: [number, number] = [event.lat, event.lon];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Map view</CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden rounded-2xl">
        <div className="h-[320px]">
          <MapContainer center={center ?? DEFAULT_CENTER} zoom={13} className="h-full w-full" scrollWheelZoom>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CircleMarker center={center} radius={10} pathOptions={{ color: '#2563eb', fillOpacity: 0.8, weight: 3 }}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{event.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCoordinate(event.lat)}, {formatCoordinate(event.lon)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
