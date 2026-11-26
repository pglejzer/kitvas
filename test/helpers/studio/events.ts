// Reads a Server-Sent Events response as it arrives.

import { type IncomingHttpHeaders, request } from 'node:http';

export type ReadEvent = { id: string | undefined; event: string; data: string };

export type EventStream = {
  status: number;
  headers: IncomingHttpHeaders;
  /** The next event; waits for it when none has come yet. */
  next(timeoutMs?: number): Promise<ReadEvent>;
  /** Comment lines (heartbeats) so far. */
  comments(): number;
  /** The `retry` field the stream sent, if any. */
  retry(): string | undefined;
  /** Everything the response carried, once it ended. */
  text(): Promise<string>;
  close(): void;
};

/** `GET /api/v1/events` on its own connection; Host is the server's own. */
export function openEvents(
  port: number,
  headers: Record<string, string> = {},
): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/events',
        agent: false,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
      (res) => {
        const queue: ReadEvent[] = [];
        const waiting: ((event: ReadEvent) => void)[] = [];
        let pending = '';
        let all = '';
        let comments = 0;
        let retry: string | undefined;
        const deliver = (event: ReadEvent): void => {
          const take = waiting.shift();
          if (take) take(event);
          else queue.push(event);
        };
        const parse = (block: string): void => {
          const event: ReadEvent = { id: undefined, event: 'message', data: '' };
          let fields = 0;
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) {
              comments += 1;
              continue;
            }
            const colon = line.indexOf(':');
            const field = colon === -1 ? line : line.slice(0, colon);
            const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
            if (field === 'retry') retry = value;
            if (field === 'id') event.id = value;
            if (field === 'event') event.event = value;
            if (field === 'data') event.data = value;
            if (field === 'id' || field === 'event' || field === 'data') fields += 1;
          }
          if (fields > 0) deliver(event);
        };
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          all += chunk;
          pending += chunk;
          for (let at = pending.indexOf('\n\n'); at !== -1; at = pending.indexOf('\n\n')) {
            parse(pending.slice(0, at));
            pending = pending.slice(at + 2);
          }
        });
        const ended = new Promise<string>((done) => {
          res.once('end', () => done(all));
          res.once('close', () => done(all));
        });
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          next: (timeoutMs = 5_000) => {
            const ready = queue.shift();
            if (ready) return Promise.resolve(ready);
            return new Promise((done, fail) => {
              const take = (event: ReadEvent): void => {
                clearTimeout(timer);
                done(event);
              };
              const timer = setTimeout(() => {
                waiting.splice(waiting.indexOf(take), 1);
                fail(new Error(`no event within ${timeoutMs} ms`));
              }, timeoutMs);
              waiting.push(take);
            });
          },
          comments: () => comments,
          retry: () => retry,
          text: () => ended,
          close: () => req.destroy(),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
