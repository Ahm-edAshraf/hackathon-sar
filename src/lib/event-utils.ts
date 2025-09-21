import { formatDistanceToNow, fromUnixTime } from 'date-fns';

import type { SarEvent } from '@/types/sar';

const SEVERITY_LEVELS = [
  { threshold: 80, label: 'Critical', className: 'bg-destructive/10 text-destructive' },
  { threshold: 50, label: 'High', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { threshold: 20, label: 'Elevated', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
];

export function getSeverityMeta(severity?: number) {
  if (typeof severity !== 'number') {
    return { label: 'Unknown', className: 'bg-muted text-muted-foreground' };
  }

  const match = SEVERITY_LEVELS.find((level) => severity >= level.threshold);
  if (match) {
    return match;
  }

  return { label: 'Low', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
}

export function formatTrustScore(trust?: number) {
  if (typeof trust !== 'number') {
    return 'N/A';
  }
  return `${Math.round(trust)}%`;
}

export function formatEventTimestamp(event: SarEvent) {
  if (!event.createdAt) {
    return 'Just now';
  }

  const seconds = Math.floor(event.createdAt / 1000);
  const date = fromUnixTime(seconds);
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatCoordinate(value?: number) {
  if (typeof value !== 'number') {
    return '—';
  }
  return value.toFixed(3);
}
