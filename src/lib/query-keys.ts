export const queryKeys = {
  events: ['events'] as const,
  event: (eventId: string) => ['event', eventId] as const,
  altRoute: ['alt-route'] as const,
  geofence: ['geofence'] as const,
  simulate: ['simulate'] as const,
};
