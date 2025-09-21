'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertCircle, RotateCcw, MapPin, Waves, Filter } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { SarEvent } from '@/types/sar';
import { formatCoordinate, formatEventTimestamp, formatTrustScore, getSeverityMeta } from '@/lib/event-utils';

interface EventFeedProps {
  events?: SarEvent[];
  isLoading: boolean;
  isFetching: boolean;
  error?: unknown;
  selectedEventId?: string | null;
  onSelect: (eventId: string) => void;
  onRefresh: () => void;
  lastUpdated?: number;
}

export function EventFeed({
  events,
  isLoading,
  isFetching,
  error,
  selectedEventId,
  onSelect,
  onRefresh,
  lastUpdated,
}: EventFeedProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'elevated' | 'low'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'classified'>('all');
  const sortedEvents = useMemo(() => {
    if (!events) {
      return [] as SarEvent[];
    }
    return [...events].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return sortedEvents.filter((event) => {
      const severity = event.severity ?? null;
      if (severityFilter !== 'all') {
        const matchesSeverity = checkSeverityMatch(severity, severityFilter);
        if (!matchesSeverity) {
          return false;
        }
      }

      if (statusFilter !== 'all') {
        const hasRationale = Boolean(event.rationale && event.rationale.trim().length > 0);
        if (statusFilter === 'pending' && hasRationale) {
          return false;
        }
        if (statusFilter === 'classified' && !hasRationale) {
          return false;
        }
      }

      return true;
    });
  }, [sortedEvents, severityFilter, statusFilter]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-semibold">Operational Feed</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isFetching ? 'Refreshing data…' : lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Live SAR incidents'}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={onRefresh} disabled={isFetching} aria-label="Refresh events">
          <RotateCcw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="pb-6">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={onRefresh} />
        ) : sortedEvents.length === 0 ? (
          <EmptyState />
        ) : filteredEvents.length === 0 ? (
          <FilteredEmptyState onClear={() => {
            setSeverityFilter('all');
            setStatusFilter('all');
          }} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-3 py-1">
                <Filter className="h-3 w-3" />
                {filteredEvents.length} of {sortedEvents.length}
              </span>
              <ToggleGroup
                type="single"
                value={`${severityFilter}:${statusFilter}`}
                onValueChange={(value) => {
                  if (!value) {
                    setSeverityFilter('all');
                    setStatusFilter('all');
                    return;
                  }
                  const [severity, status] = value.split(':') as [typeof severityFilter, typeof statusFilter];
                  setSeverityFilter(severity);
                  setStatusFilter(status);
                }}
                className="flex flex-wrap gap-1 rounded-full bg-muted/30 p-0.5"
              >
                {filterSegments.map((segment) => (
                  <ToggleGroupItem key={segment.id} value={segment.value} className={toggleButtonClass}>
                    {segment.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <ScrollArea className="h-[22rem] pr-2">
              <ul className="space-y-3">
                {filteredEvents.map((event) => {
                  const severity = getSeverityMeta(event.severity);
                  const isSelected = event.eventId === selectedEventId;

                  return (
                    <li key={event.eventId}>
                      <button
                        type="button"
                        onClick={() => onSelect(event.eventId)}
                        className={cn(
                        'w-full rounded-2xl border bg-card/95 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 shadow-sm shadow-primary/10'
                          : 'border-border/60 hover:border-primary/30 hover:bg-card',
                      )}
                    >
                      <article className="flex flex-col gap-3 p-4">
                        <header className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('rounded-full px-3 py-0.5 text-xs font-medium', severity.className)}>
                              {severity.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatEventTimestamp(event)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">Trust {formatTrustScore(event.trust)}</span>
                        </header>
                        <p className="text-sm text-foreground/90 line-clamp-3 leading-relaxed">{event.text}</p>
                        <footer className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {formatCoordinate(event.lat)}, {formatCoordinate(event.lon)}
                          </span>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                            <Link href={`/events/${event.eventId}`}>Open details</Link>
                          </Button>
                        </footer>
                      </article>
                    </button>
                  </li>
                );
                })}
              </ul>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/40 text-center">
      <p className="text-sm font-medium text-muted-foreground">No events match the current filters.</p>
      <Button size="sm" variant="outline" onClick={onClear}>
        Reset filters
      </Button>
    </div>
  );
}

function checkSeverityMatch(severity: number | null, filter: 'critical' | 'high' | 'elevated' | 'low' | 'all') {
  if (filter === 'all') {
    return true;
  }
  if (severity === null || Number.isNaN(severity)) {
    return filter === 'low';
  }
  if (filter === 'critical') {
    return severity >= 80;
  }
  if (filter === 'high') {
    return severity >= 50 && severity < 80;
  }
  if (filter === 'elevated') {
    return severity >= 20 && severity < 50;
  }
  return severity < 20;
}

const toggleButtonClass =
  'rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm';

const filterSegments: Array<{ id: string; value: string; label: string }> = [
  { id: 'all', value: 'all:all', label: 'All' },
  { id: 'critical', value: 'critical:all', label: 'Critical' },
  { id: 'high', value: 'high:all', label: 'High' },
  { id: 'elevated', value: 'elevated:all', label: 'Elevated' },
  { id: 'low', value: 'low:all', label: 'Low' },
  { id: 'pending', value: 'all:pending', label: 'Pending' },
  { id: 'classified', value: 'all:classified', label: 'Classified' },
];

function EmptyState() {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/40">
      <Waves className="h-6 w-6 text-muted-foreground" />
      <div className="text-center text-sm text-muted-foreground">
        <p>No active SAR events yet.</p>
        <p className="text-xs">Use the Report tab to ingest a new incident.</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-destructive">Could not load events.</p>
      <Button variant="destructive" onClick={onRetry} size="sm">
        Try again
      </Button>
    </div>
  );
}
