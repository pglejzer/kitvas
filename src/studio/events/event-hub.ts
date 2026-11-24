// Events for open studio tabs, as Server-Sent Events: numbered, replayed after a reconnect,
// kept alive by a heartbeat, with a cap on open streams.

import type { ServerResponse } from 'node:http';
import { RequestError } from '../http/problem.ts';

/** `source` and `build` are the editor's (api/edit-schemas.ts). */
/**
 * `requests` (spec 4d): a draft's requests or the listening session changed, data `{slug}`.
 * `locks` (spec 4d): another writer changed a locked element, data `{slug, changed: string[]}`.
 * `drafts` (ADR 0064): a draft was deleted, restored or removed for good, data `{slug, change}`.
 */
export type EventType = 'job' | 'inbox' | 'source' | 'build' | 'requests' | 'locks' | 'drafts';

export type StudioEvent = { id: number; type: EventType | 'reset'; data: unknown };

export type EventLimits = {
  /** Events kept for tabs that reconnect. */
  buffer: number;
  /** Streams open at once; one per studio tab. */
  streams: number;
  /** A comment line this often keeps an idle stream open. */
  heartbeatMs: number;
};

export const EVENT_LIMITS: EventLimits = { buffer: 200, streams: 16, heartbeatMs: 15_000 };

/** How long a browser waits before it reconnects, sent as the stream's `retry` field. */
const RETRY_MS = 2_000;
const LAST_ID = /^[0-9]{1,15}$/;

export type EventHub = {
  publish(type: EventType, data: unknown): void;
  /** Answers an events request: what the tab missed, then every new event until it leaves. */
  open(res: ServerResponse, headers: Record<string, string>, lastEventId: string | undefined): void;
  /** Ends every open stream: the studio is stopping. */
  close(): void;
  /** Streams open now. */
  count(): number;
};

const frame = (event: StudioEvent): string =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

export function createEventHub(limits: Partial<EventLimits> = {}): EventHub {
  const { buffer, streams, heartbeatMs } = { ...EVENT_LIMITS, ...limits };
  const recent: StudioEvent[] = [];
  /** Open streams and their heartbeat timers. */
  const live = new Map<ServerResponse, NodeJS.Timeout>();
  let lastId = 0;

  /** A stream the client left, or one already ended, is skipped. */
  const send = (res: ServerResponse, text: string): void => {
    if (!res.writableEnded && !res.destroyed) res.write(text);
  };

  /** Events after `header`; a reset when they are gone or the id comes from an earlier studio. */
  function missed(header: string | undefined): StudioEvent[] {
    if (header === undefined) return [];
    const reset: StudioEvent[] = [{ id: lastId, type: 'reset', data: {} }];
    if (!LAST_ID.test(header)) return reset;
    const seen = Number(header);
    if (seen === lastId) return [];
    const oldest = recent[0]?.id ?? lastId + 1;
    if (seen > lastId || seen < oldest - 1) return reset;
    return recent.filter((event) => event.id > seen);
  }

  return {
    publish(type, data) {
      lastId += 1;
      const event: StudioEvent = { id: lastId, type, data };
      recent.push(event);
      if (recent.length > buffer) recent.shift();
      const text = frame(event);
      for (const res of live.keys()) send(res, text);
    },
    open(res, headers, lastEventId) {
      if (live.size >= streams) {
        throw new RequestError('STREAM_LIMIT', {}, { headers: { 'retry-after': '5' } });
      }
      res.writeHead(200, { ...headers, 'content-type': 'text/event-stream; charset=utf-8' });
      res.write(`retry: ${RETRY_MS}\n\n`);
      for (const event of missed(lastEventId)) res.write(frame(event));
      const beat = setInterval(() => send(res, ': ping\n\n'), heartbeatMs);
      beat.unref();
      live.set(res, beat);
      res.once('close', () => {
        clearInterval(beat);
        live.delete(res);
      });
    },
    close() {
      for (const [res, beat] of live) {
        clearInterval(beat);
        res.end();
      }
      live.clear();
    },
    count: () => live.size,
  };
}
