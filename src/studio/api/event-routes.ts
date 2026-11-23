// The studio's events stream.

import type { EventHub } from '../events/event-hub.ts';
import { type ApiRoute, apiRoute } from '../http/router.ts';
import { NoParams, StudioEventSchema } from './schemas.ts';

export function eventRoutes(deps: { events: EventHub }): ApiRoute[] {
  return [
    apiRoute({
      id: 'streamEvents',
      summary:
        'Server-Sent Events of the studio. With Last-Event-ID a reconnecting tab gets what it missed, or a reset event.',
      method: 'GET',
      path: '/api/v1/events',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: StudioEventSchema, stream: true },
      handle: ({ headers }) => {
        const last = headers['last-event-id'];
        return {
          status: 200,
          body: null,
          open: (res, base) =>
            deps.events.open(res, base, typeof last === 'string' ? last : undefined),
        };
      },
    }),
  ];
}
