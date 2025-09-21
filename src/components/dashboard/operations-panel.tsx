'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { AlertTriangle, ArrowBigUpDash, BellRing, Megaphone, Loader2, Play } from 'lucide-react';

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

interface OperationsPanelProps {
  onEventCreated?: (eventId: string) => void;
  onRoutePlanned?: (payload: RoutePlanPayload) => void;
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

export function OperationsPanel({ onEventCreated, onRoutePlanned }: OperationsPanelProps) {
  const queryClient = useQueryClient();
  const [routeSummary, setRouteSummary] = useState<AltRouteResponse | null>(null);
  const [geofenceSummary, setGeofenceSummary] = useState<GeofenceResponse | null>(null);
  const [lastSimulation, setLastSimulation] = useState<SimulateReplayResponse | null>(null);

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
    },
    onError: (error: unknown) => {
      toast.error('Could not ingest event', {
        description: extractErrorMessage(error),
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
    },
    onError: (error: unknown) => {
      toast.error('Route planner failed', {
        description: extractErrorMessage(error),
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
    },
    onError: (error: unknown) => {
      toast.error('Could not set geofence', {
        description: extractErrorMessage(error),
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
    },
    onError: (error: unknown) => {
      toast.error('Simulation failed', {
        description: extractErrorMessage(error),
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
        <Tabs defaultValue="report" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="report" className="gap-2 text-xs sm:text-sm">
              <Megaphone className="h-4 w-4" /> Report
            </TabsTrigger>
            <TabsTrigger value="routing" className="gap-2 text-xs sm:text-sm">
              <ArrowBigUpDash className="h-4 w-4" /> Routing
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2 text-xs sm:text-sm">
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
                <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="grid gap-4 sm:grid-cols-2">
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
              </form>
            </Form>
            {routeSummary ? (
              <div className="rounded-2xl border bg-muted/50 p-4 text-sm">
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
                <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="rounded-2xl border bg-muted/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Demo replay</p>
              <p className="text-xs text-muted-foreground">
                Inject the standard demo stream to populate dashboards instantly.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => simulationMutation.mutate()}
              disabled={simulationMutation.isPending}
              className="gap-2"
            >
              {simulationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Launch replay
            </Button>
          </div>
          {lastSimulation ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {lastSimulation.count} events streaming ·{' '}
              <span className="font-medium text-foreground">started: {new Date().toLocaleTimeString()}</span>
            </p>
          ) : null}
        </div>
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
    <div className={cn('flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary')}>
      {children}
    </div>
  );
}
