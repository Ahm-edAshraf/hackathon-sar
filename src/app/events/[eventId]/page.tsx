import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft, Clock, MapPin, ShieldHalf, Waves } from 'lucide-react';

import { EventDetailMap } from '@/components/event-detail/event-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCoordinate, formatEventTimestamp, formatTrustScore, getSeverityMeta } from '@/lib/event-utils';
import { callBackendJson } from '@/lib/server-api';
import type { ExplainEventResponse, ListEventsResponse, SarEvent } from '@/types/sar';

interface EventDetailPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { eventId } = await params;
  return {
    title: `Event ${decodeURIComponent(eventId)} · SAR Mission Console`,
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { eventId: rawId } = await params;
  const eventId = decodeURIComponent(rawId);

  const eventsData = await callBackendJson<ListEventsResponse>('events');
  const event = eventsData.events.find((record) => record.eventId === eventId);

  if (!event) {
    notFound();
  }

  let explanation: ExplainEventResponse | null = null;
  try {
    explanation = await callBackendJson<ExplainEventResponse>(`events/${encodeURIComponent(eventId)}/explain`);
  } catch (error) {
    console.error('Failed to load explanation', error);
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-8 py-10 lg:py-14">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-10 w-10 rounded-full">
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to dashboard</span>
          </Link>
        </Button>
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Mission insight</p>
          <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Event {eventId.slice(0, 8)}</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <EventSummaryCard event={event} />
          <RationaleCard explanation={explanation} />
          <TraceCard explanation={explanation} />
        </section>
        <aside className="flex flex-col gap-6">
          <Suspense fallback={<SkeletonMapCard />}>
            <EventDetailMap event={event} />
          </Suspense>
          <IntelCard event={event} />
        </aside>
      </div>
    </main>
  );
}

function EventSummaryCard({ event }: { event: SarEvent }) {
  const severity = getSeverityMeta(event.severity);

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge className="rounded-full px-3 py-1 text-xs font-semibold" variant="outline">
            {formatEventTimestamp(event)}
          </Badge>
          <CardTitle className="text-2xl font-semibold leading-tight">{event.text}</CardTitle>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Severity</span>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${severity.className}`}>{severity.label}</span>
          <span className="text-xs text-muted-foreground">Trust {formatTrustScore(event.trust)}</span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <span>
            {formatCoordinate(event.lat)}, {formatCoordinate(event.lon)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Awaiting timestamp'}</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldHalf className="h-4 w-4" />
          <span>Nova Lite rationale stored downstream</span>
        </div>
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4" />
          <span>{event.rationale ?? 'Classification pending…'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RationaleCard({ explanation }: { explanation: ExplainEventResponse | null }) {
  if (!explanation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Nova Lite assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Explanation pending — trigger &ldquo;Explain&rdquo; via the MCP middleware.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Nova Lite assessment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-2xl border bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
          {explanation.rationale}
        </p>
        {explanation.cues && explanation.cues.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {explanation.cues.map((cue) => (
              <Badge key={cue} variant="secondary" className="rounded-full px-3 py-1 text-xs">
                {cue}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between rounded-2xl border bg-card p-4 text-sm">
          <span className="text-muted-foreground">Trust score</span>
          <span className="text-2xl font-semibold text-primary">{explanation.trustScore ?? 'N/A'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function TraceCard({ explanation }: { explanation: ExplainEventResponse | null }) {
  if (!explanation || !explanation.trace || explanation.trace.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Model trace</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-6">
          {explanation.trace.map((step, index) => (
            <li key={`${step.tool}-${index}`} className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex-1 rounded-2xl border bg-muted/50 p-4">
                <p className="text-sm font-medium text-foreground">{step.tool}</p>
                <p className="text-xs text-muted-foreground">{step.ms} ms</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function IntelCard({ event }: { event: SarEvent }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Field intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div>
          <p className="font-semibold text-foreground">Event ID</p>
          <p className="font-mono text-xs text-muted-foreground">{event.eventId}</p>
        </div>
        <Separator />
        <div>
          <p className="font-semibold text-foreground">Media assets</p>
          {event.mediaUrl ? (
            <Button variant="link" size="sm" className="px-0" asChild>
              <Link href={event.mediaUrl} target="_blank" rel="noopener noreferrer">
                View attachment
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No media provided</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonMapCard() {
  return (
    <Card className="h-[320px] animate-pulse">
      <CardContent className="h-full" />
    </Card>
  );
}
