'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Flame, MapPinned, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MissionMap } from '@/components/dashboard/mission-map';
import { EventFeed } from '@/components/dashboard/event-feed';
import { OperationsPanel, type RoutePlanPayload, type CoordinateSelectionRequest } from '@/components/dashboard/operations-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { queryKeys } from '@/lib/query-keys';
import { getEvents } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { SarEvent } from '@/types/sar';

export function DashboardPage() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { data, error, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.events,
    queryFn: getEvents,
    refetchInterval: 60_000,
  });

  const [routeOverlay, setRouteOverlay] = useState<RoutePlanPayload | null>(null);
  const [coordinateRequest, setCoordinateRequest] = useState<CoordinateSelectionRequest | null>(null);
  const events = useMemo(() => data?.events ?? [], [data?.events]);

  useEffect(() => {
    if (events.length === 0) {
      setSelectedEventId(null);
      return;
    }

    if (!selectedEventId) {
      setSelectedEventId(events[0].eventId);
    } else if (!events.some((event) => event.eventId === selectedEventId)) {
      setSelectedEventId(events[0].eventId);
    }
  }, [events, selectedEventId]);

  const metrics = useMemo(() => buildMetrics(events), [events]);
  const status = useMemo(() => buildStatus(events, {
    hasError: !!error,
    isFetching,
    updatedAt: dataUpdatedAt,
  }), [events, error, isFetching, dataUpdatedAt]);
  const selectedEvent = events.find((event) => event.eventId === selectedEventId) ?? null;

  const handleCoordinatePicked = useCallback(
    (coords: { lat: number; lon: number }) => {
      coordinateRequest?.onSelect(coords);
      setCoordinateRequest(null);
    },
    [coordinateRequest],
  );

  return (
    <div className="space-y-8">
      <HeroSection metrics={metrics} hasSelection={!!selectedEvent} status={status} />
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,360px)_1fr] 2xl:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-6" id="mission-control">
          <OperationsPanel
            onEventCreated={setSelectedEventId}
            onRoutePlanned={setRouteOverlay}
            onCoordinateSelectionRequest={setCoordinateRequest}
            activeCoordinateSelection={coordinateRequest?.id ?? null}
          />
        </div>
        <div className="flex flex-col gap-6">
          <MissionMap
            events={events}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
            routePlan={routeOverlay}
            coordinateRequest={coordinateRequest}
            onCoordinatePick={handleCoordinatePicked}
          />
          <EventFeed
            events={events}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error ?? undefined}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
            onRefresh={() => refetch()}
            lastUpdated={dataUpdatedAt}
          />
        </div>
      </div>
    </div>
  );
}

interface MetricCard {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

interface HeroStatus {
  apiHealthy: boolean;
  isRefreshing: boolean;
  lastSynced?: number;
  classified: number;
  pending: number;
}

function buildMetrics(events: SarEvent[]): MetricCard[] {
  const total = events.length;
  const highestSeverity = events.reduce((max, event) => Math.max(max, event.severity ?? 0), 0);
  const avgTrust = events.reduce((sum, event) => sum + (event.trust ?? 0), 0) / (events.length || 1);
  const coastal = events.filter((event) => (event.lat ?? 0) > 3 && (event.lon ?? 0) > 101).length;

  return [
    {
      label: 'Active events',
      value: total.toString(),
      description: 'Reports currently tracked and triaged',
      icon: <Activity className="h-5 w-5" />,
    },
    {
      label: 'Peak severity',
      value: highestSeverity ? `${highestSeverity}` : '—',
      description: 'Highest Nova Lite severity score from feed',
      icon: <Flame className="h-5 w-5" />,
    },
    {
      label: 'Confidence index',
      value: events.length ? `${Math.round(avgTrust)}%` : '—',
      description: 'Average trust score across live events',
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      label: 'Coastal alerts',
      value: coastal.toString(),
      description: 'Events clustered along the coast corridor',
      icon: <MapPinned className="h-5 w-5" />,
    },
  ];
}

interface HeroSectionProps {
  metrics: MetricCard[];
  hasSelection: boolean;
  status: HeroStatus;
}

function HeroSection({ metrics, hasSelection, status }: HeroSectionProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
      <div className="absolute inset-y-0 right-0 hidden translate-x-24 skew-x-[35deg] bg-primary/10 blur-3xl md:block" />
      <div className="relative z-10 flex flex-col gap-6 p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            SAR mission console
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Coordinate rapid response with live MCP intelligence
          </h1>
          <p className="text-base text-muted-foreground">
            Streamline ingest, geofence alerts, and map overlays while Nova Lite enriches every report with rationale and trust scoring.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="default" className="rounded-full px-5" asChild>
              <Link href="#mission-control">Launch mission brief</Link>
            </Button>
            <ThemeToggle />
          </div>
          <StatusStrip status={status} />
        </div>
        <Separator orientation="vertical" className="hidden h-40 lg:block" />
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:w-[420px]">
          {metrics.map((metric) => (
            <MetricTile key={metric.label} metric={metric} />
          ))}
        </div>
      </div>
      {hasSelection ? null : (
        <div className="relative z-10 border-t border-primary/20 bg-primary/5 px-8 py-4 text-sm text-primary">
          Tip: select an event from the feed to spotlight it on the mission map.
        </div>
      )}
    </div>
  );
}

function MetricTile({ metric }: { metric: MetricCard }) {
  return (
    <Card className="border-primary/40 bg-background/70 backdrop-blur">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-primary">
          <span className="rounded-full bg-primary/10 p-2">{metric.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            {metric.label}
          </span>
        </div>
        <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
        <p className="text-xs text-muted-foreground">{metric.description}</p>
      </CardContent>
    </Card>
  );
}

function StatusStrip({ status }: { status: HeroStatus }) {
  const syncLabel = status.lastSynced ? new Date(status.lastSynced).toLocaleTimeString() : '—';
  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium',
          status.apiHealthy ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive',
        )}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.apiHealthy ? '#34d399' : '#ef4444' }} />
        {status.apiHealthy ? 'API healthy' : 'API issue'}
        {status.isRefreshing ? ' · refreshing…' : null}
      </span>
      <span className="rounded-full bg-muted/40 px-3 py-1">Last sync {syncLabel}</span>
      <span className="rounded-full bg-muted/40 px-3 py-1">
        {status.classified} classified · {status.pending} pending
      </span>
    </div>
  );
}

function buildStatus(
  events: SarEvent[],
  context: { hasError: boolean; isFetching: boolean; updatedAt?: number },
): HeroStatus {
  const classified = events.filter((event) => Boolean(event.rationale && event.rationale.trim().length > 0)).length;
  const pending = Math.max(events.length - classified, 0);
  return {
    apiHealthy: !context.hasError,
    isRefreshing: context.isFetching,
    lastSynced: context.updatedAt,
    classified,
    pending,
  };
}
