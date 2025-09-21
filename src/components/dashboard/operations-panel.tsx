'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowBigUpDash,
  BellRing,
  Megaphone,
  Loader2,
  Play,
  MapPin,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  ApiError,
  ingestEvent,
  requestAltRoute,
  setGeofenceAlert,
  simulateReplay,
} from '@/lib/api-client';
import type {
  AltRouteRequest,
  AltRouteResponse,
  GeofenceRequest,
  GeofenceResponse,
  IngestEventRequest,
  IngestEventResponse,
  SimulateReplayResponse,
} from '@/types/sar';

export interface RoutePlanPayload {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  summary: AltRouteResponse;
}

export interface CoordinateSelectionRequest {
  id: string;
  label: string;
  onSelect: (coords: { lat: number; lon: number }) => void;
}

interface ActivityLogEntry {
  id: string;
  label: string;
  status: 'success' | 'error';
  detail?: string;
  timestamp: number;
}

interface OperationsPanelProps {
  onEventCreated?: (eventId: string) => void;
  onRoutePlanned?: (payload: RoutePlanPayload) => void;
  onCoordinateSelectionRequest?: (request: CoordinateSelectionRequest | null) => void;
  activeCoordinateSelection?: string | null;
}

const coordinateSchema = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) {
        return undefined;
      }
      const numberValue = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(Number(numberValue)) ? Number(numberValue) : value;
    },
    z
      .number()
      .min(min, `${label} must be ≥ ${min}`)
      .max(max, `${label} must be ≤ ${max}`)
      .optional(),
  );

const optionalUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().url('Provide a valid URL').optional(),
);

const ingestSchema = z.object({
  text: z.string().min(3, 'Add a short summary of the incident'),
  lat: coordinateSchema(-90, 90, 'Latitude').default(3.043),
  lon: coordinateSchema(-180, 180, 'Longitude').default(101.449),
  mediaUrl: optionalUrlSchema,
});

type IngestSchema = z.infer<typeof ingestSchema>;

const altRouteSchema = z.object({
  originLat: coordinateSchema(-90, 90, 'Origin latitude').default(3.043),
  originLon: coordinateSchema(-180, 180, 'Origin longitude').default(101.449),
  destLat: coordinateSchema(-90, 90, 'Destination latitude').default(3.155),
  destLon: coordinateSchema(-180, 180, 'Destination longitude').default(101.712),
});

type AltRouteSchema = z.infer<typeof altRouteSchema>;

const geofenceSchema = z.object({
  lat: coordinateSchema(-90, 90, 'Latitude').default(3.043),
  lon: coordinateSchema(-180, 180, 'Longitude').default(101.449),
  radiusKm: z
    .preprocess(
      (value) => {
        if (value === '' || value === null || value === undefined) return undefined;
        const numberValue = typeof value === 'string' ? Number(value) : value;
        return Number.isFinite(Number(numberValue)) ? Number(numberValue) : value;
      },
      z.number().positive('Radius must be greater than 0').max(50, 'Radius capped at 50km'),
    )
    .default(1),
});

type GeofenceSchema = z.infer<typeof geofenceSchema>;

export function OperationsPanel({
  onEventCreated,
  onRoutePlanned,
  onCoordinateSelectionRequest,
  activeCoordinateSelection,
}: OperationsPanelProps) {
  const queryClient = useQueryClient();
  const [routeSummary, setRouteSummary] = useState<AltRouteResponse | null>(null);
  const [geofenceSummary, setGeofenceSummary] = useState<GeofenceResponse | null>(null);
  const [lastSimulation, setLastSimulation] = useState<SimulateReplayResponse | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  const pushActivity = (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => {
    setActivityLog((previous) => {
      const record: ActivityLogEntry = {
        ...entry,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      return [record, ...previous].slice(0, 8);
    });
  };

  const ingestForm = useForm<IngestSchema>({
    resolver: zodResolver(ingestSchema) as Resolver<IngestSchema>,
    defaultValues: {
      text: '',
      lat: 3.043,
      lon: 101.449,
      mediaUrl: undefined,
    },
  });

  const altRouteForm = useForm<AltRouteSchema>({
    resolver: zodResolver(altRouteSchema) as Resolver<AltRouteSchema>,
    defaultValues: {
      originLat: 3.043,
      originLon: 101.449,
      destLat: 3.155,
      destLon: 101.712,
    },
  });

  const geofenceForm = useForm<GeofenceSchema>({
    resolver: zodResolver(geofenceSchema) as Resolver<GeofenceSchema>,
    defaultValues: {
      lat: 3.043,
      lon: 101.449,
      radiusKm: 1,
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (values: IngestSchema) => ingestEvent(sanitisePayload(values)),
    onSuccess: (data: IngestEventResponse, variables: IngestSchema) => {
      toast.success('Event broadcast', {
        description: `Nova Lite will classify report ${data.eventId.slice(0, 8)}…`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
      onEventCreated?.(data.eventId);
      ingestForm.reset({ ...variables, text: '', mediaUrl: undefined });
      pushActivity({
        label: `Report dispatched (${data.eventId.slice(0, 6)})`,
        status: 'success',
        detail: 'Awaiting Nova Lite classification',
      });
    },
    onError: (error: unknown) => {
      toast.error('Could not ingest event', {
        description: extractErrorMessage(error),
      });
      pushActivity({
        label: 'Report dispatch failed',
        status: 'error',
        detail: extractErrorMessage(error),
      });
    },
  });

  const altRouteMutation = useMutation({
    mutationFn: (values: AltRouteSchema) => requestAltRoute(values as AltRouteRequest),
    onSuccess: (data, variables) => {
      setRouteSummary(data);
      toast.success('Alternate route ready', {
        description: `ETA ${data.etaMin} min · ${data.distanceKm.toFixed(2)} km`,
      });
      if (variables && onRoutePlanned) {
        onRoutePlanned({
          origin: {
            lat: ensureNumber(variables.originLat),
            lon: ensureNumber(variables.originLon),
          },
          destination: {
            lat: ensureNumber(variables.destLat),
            lon: ensureNumber(variables.destLon),
          },
          summary: data,
        });
      }
      pushActivity({
        label: 'Alternate route generated',
        status: 'success',
        detail: `${data.distanceKm.toFixed(1)} km · ${data.etaMin} min`,
      });
    },
    onError: (error: unknown) => {
      toast.error('Route planner failed', {
        description: extractErrorMessage(error),
      });
      pushActivity({
        label: 'Route planning failed',
        status: 'error',
        detail: extractErrorMessage(error),
      });
    },
  });

  const geofenceMutation = useMutation({
    mutationFn: (values: GeofenceSchema) => setGeofenceAlert(values as GeofenceRequest),
    onSuccess: (data) => {
      setGeofenceSummary(data);
      toast.success('Alert delivered', {
        description: `${data.delivered} responder${data.delivered === 1 ? '' : 's'} notified in geofence`,
      });
      pushActivity({
        label: 'Geofence alert sent',
        status: 'success',
        detail: `${data.delivered} recipient${data.delivered === 1 ? '' : 's'} reached`,
      });
    },
    onError: (error: unknown) => {
      toast.error('Could not set geofence', {
        description: extractErrorMessage(error),
      });
      pushActivity({
        label: 'Geofence alert failed',
        status: 'error',
        detail: extractErrorMessage(error),
      });
    },
  });

  const simulationMutation = useMutation({
    mutationFn: simulateReplay,
    onSuccess: (data) => {
      setLastSimulation(data);
      toast.success('Replay kicked off', {
        description: `${data.count} demo events streaming in`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
      pushActivity({
        label: 'Demo replay launched',
        status: 'success',
        detail: `${data.count} events`,
      });
    },
    onError: (error: unknown) => {
      toast.error('Simulation failed', {
        description: extractErrorMessage(error),
      });
      pushActivity({
        label: 'Replay launch failed',
        status: 'error',
        detail: extractErrorMessage(error),
      });
    },
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Mission Control</CardTitle>
        <CardDescription>Submit intel, request diversions, and trigger alerting workflows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {activeCoordinateSelection ? (
          <InlineHint>
            <MapPin className="h-4 w-4" />
            <span>Select a point on the mission map for this form.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onCoordinateSelectionRequest?.(null)}
            >
              Cancel
            </Button>
          </InlineHint>
        ) : null}
        <Tabs defaultValue="report" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted/30 p-1 text-xs">
            <TabsTrigger value="report" className="gap-1 rounded-full text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm">
              <Megaphone className="h-4 w-4" /> Report
            </TabsTrigger>
            <TabsTrigger value="routing" className="gap-1 rounded-full text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm">
              <ArrowBigUpDash className="h-4 w-4" /> Routing
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1 rounded-full text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm">
              <BellRing className="h-4 w-4" /> Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-5 space-y-4">
            <Form {...ingestForm}>
              <form
                className="space-y-4"
                onSubmit={ingestForm.handleSubmit((values) => ingestMutation.mutate(values))}
              >
                <FormField
                  control={ingestForm.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Situation report</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Flash flood reported near Klang river — water rising fast"
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={ingestForm.control}
                    name="lat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" placeholder="3.043" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={ingestForm.control}
                    name="lon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" placeholder="101.449" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant={activeCoordinateSelection === 'ingest-location' ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-2 rounded-full text-xs"
                    onClick={() => {
                      if (activeCoordinateSelection === 'ingest-location') {
                        onCoordinateSelectionRequest?.(null);
                        return;
                      }
                      onCoordinateSelectionRequest?.({
                        id: 'ingest-location',
                        label: 'report location',
                        onSelect: ({ lat, lon }) => {
                          ingestForm.setValue('lat', roundCoord(lat), { shouldDirty: true, shouldTouch: true });
                          ingestForm.setValue('lon', roundCoord(lon), { shouldDirty: true, shouldTouch: true });
                          toast.success('Report coordinates set from map');
                        },
                      });
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                    {activeCoordinateSelection === 'ingest-location' ? 'Tap map to confirm…' : 'Select on map'}
                  </Button>
                </div>
                <FormField
                  control={ingestForm.control}
                  name="mediaUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Media evidence URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={ingestMutation.isPending}>
                  {ingestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Dispatch report
                </Button>
              </form>
            </Form>
            <InlineHint>
              <AlertTriangle className="h-4 w-4" /> Severity and trust are auto-scored by Nova Lite downstream.
            </InlineHint>
          </TabsContent>

          <TabsContent value="routing" className="mt-5 space-y-4">
            <Form {...altRouteForm}>
              <form
                className="space-y-4"
                onSubmit={altRouteForm.handleSubmit((values) => altRouteMutation.mutate(values))}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={altRouteForm.control}
                    name="originLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Origin lat</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={altRouteForm.control}
                    name="originLon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Origin lon</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={altRouteForm.control}
                    name="destLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination lat</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={altRouteForm.control}
                    name="destLon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination lon</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={altRouteMutation.isPending}>
                  {altRouteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Request diversion
                </Button>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeCoordinateSelection === 'route-origin' ? 'default' : 'ghost'}
                    className="gap-2 rounded-full text-xs"
                    onClick={() => {
                      if (activeCoordinateSelection === 'route-origin') {
                        onCoordinateSelectionRequest?.(null);
                        return;
                      }
                      onCoordinateSelectionRequest?.({
                        id: 'route-origin',
                        label: 'route origin',
                        onSelect: ({ lat, lon }) => {
                          altRouteForm.setValue('originLat', roundCoord(lat), { shouldDirty: true, shouldTouch: true });
                          altRouteForm.setValue('originLon', roundCoord(lon), { shouldDirty: true, shouldTouch: true });
                          toast.success('Origin coordinates set from map');
                        },
                      });
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                    {activeCoordinateSelection === 'route-origin' ? 'Set origin via map…' : 'Pick origin on map'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeCoordinateSelection === 'route-destination' ? 'default' : 'ghost'}
                    className="gap-2 rounded-full text-xs"
                    onClick={() => {
                      if (activeCoordinateSelection === 'route-destination') {
                        onCoordinateSelectionRequest?.(null);
                        return;
                      }
                      onCoordinateSelectionRequest?.({
                        id: 'route-destination',
                        label: 'route destination',
                        onSelect: ({ lat, lon }) => {
                          altRouteForm.setValue('destLat', roundCoord(lat), { shouldDirty: true, shouldTouch: true });
                          altRouteForm.setValue('destLon', roundCoord(lon), { shouldDirty: true, shouldTouch: true });
                          toast.success('Destination coordinates set from map');
                        },
                      });
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                    {activeCoordinateSelection === 'route-destination' ? 'Set destination via map…' : 'Pick destination on map'}
                  </Button>
                </div>
              </form>
            </Form>
            {routeSummary ? (
              <div className="rounded-2xl border border-border/60 bg-card/80 p-4 text-sm">
                <p className="font-semibold">Route summary</p>
                <p className="text-muted-foreground">
                  Distance <span className="font-medium text-foreground">{routeSummary.distanceKm.toFixed(2)} km</span> · ETA{' '}
                  <span className="font-medium text-foreground">{routeSummary.etaMin} mins</span>
                </p>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="alerts" className="mt-5 space-y-4">
            <Form {...geofenceForm}>
              <form
                className="space-y-4"
                onSubmit={geofenceForm.handleSubmit((values) => geofenceMutation.mutate(values))}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={geofenceForm.control}
                    name="lat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={geofenceForm.control}
                    name="lon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={geofenceForm.control}
                  name="radiusKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Radius (km)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={geofenceMutation.isPending}>
                  {geofenceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send geofence alert
                </Button>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeCoordinateSelection === 'geofence-center' ? 'default' : 'ghost'}
                    className="gap-2 rounded-full text-xs"
                    onClick={() => {
                      if (activeCoordinateSelection === 'geofence-center') {
                        onCoordinateSelectionRequest?.(null);
                        return;
                      }
                      onCoordinateSelectionRequest?.({
                        id: 'geofence-center',
                        label: 'geofence center',
                        onSelect: ({ lat, lon }) => {
                          geofenceForm.setValue('lat', roundCoord(lat), { shouldDirty: true, shouldTouch: true });
                          geofenceForm.setValue('lon', roundCoord(lon), { shouldDirty: true, shouldTouch: true });
                          toast.success('Geofence center set from map');
                        },
                      });
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                    {activeCoordinateSelection === 'geofence-center' ? 'Tap map to confirm…' : 'Select center on map'}
                  </Button>
                </div>
              </form>
            </Form>
            {geofenceSummary ? (
              <div className="rounded-2xl border bg-muted/50 p-4 text-sm">
                <p className="font-semibold">Alert status</p>
                <p className="text-muted-foreground">
                  Delivered to <span className="font-medium text-foreground">{geofenceSummary.delivered}</span> unit
                  {geofenceSummary.delivered === 1 ? '' : 's'} in radius.
                </p>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Demo replay</p>
              <p className="text-xs text-muted-foreground">Seed with sample SAR events.</p>
            </div>
            <Button
              size="sm"
              onClick={() => simulationMutation.mutate()}
              disabled={simulationMutation.isPending}
              className="gap-2 rounded-full text-xs"
            >
              {simulationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Launch
            </Button>
          </div>
          {lastSimulation ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {lastSimulation.count} events streaming ·{' '}
              <span className="font-medium text-foreground">started {new Date().toLocaleTimeString()}</span>
            </p>
          ) : null}
        </div>

        <ActivityTimeline entries={activityLog} />
      </CardContent>
    </Card>
  );
}

function sanitisePayload(values: IngestSchema): IngestEventRequest {
  const mediaUrl = typeof values.mediaUrl === 'string' && values.mediaUrl.trim().length > 0 ? values.mediaUrl.trim() : undefined;
  return {
    text: values.text,
    lat: values.lat ?? undefined,
    lon: values.lon ?? undefined,
    mediaUrl,
  };
}

function ensureNumber(value: number | undefined) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function extractErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.details === 'object' && error.details && 'message' in (error.details as Record<string, unknown>)) {
      return String((error.details as Record<string, unknown>).message);
    }
    if (typeof error.details === 'string') {
      return error.details;
    }
    return `${error.status} · ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error';
}

function InlineHint({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] text-primary')}>
      {children}
    </div>
  );
}

function roundCoord(value: number) {
  return Number(value.toFixed(3));
}

function ActivityTimeline({ entries }: { entries: ActivityLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/70 p-4 text-xs text-muted-foreground">
        Recent automation activity will appear here as you trigger tools.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
      <p className="text-sm font-semibold text-foreground">Recent automations</p>
      <ul className="mt-3 space-y-2 text-xs">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 shadow-sm">
            {entry.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <div className="flex-1">
              <p className="font-medium text-foreground">{entry.label}</p>
              {entry.detail ? <p className="text-muted-foreground">{entry.detail}</p> : null}
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
