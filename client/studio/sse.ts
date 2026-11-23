// The studio's Server-Sent Events, read with fetch: one code path whether the page cookie or a
// token lets the request in. A pure parser turns the text into events however the network splits
// it, and a dropped stream comes back after a pause that grows.

/** One dispatched event: its type (`message` when the stream names none), its data, its id. */
export type StreamEvent = { event: string; data: string; id?: string };

export type ParsedStream = {
  events: StreamEvent[];
  /** The text after the last complete event; the next chunk is appended to it. */
  rest: string;
};

/** CRLF, CR or LF: CRLF first, so it counts as one line end. */
const LINE_END = /\r\n|\r|\n/g;
const FIRST_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;
/** An event this long is not one the studio sends; the stream is dropped and opened again. */
const MAX_PENDING = 1_000_000;

/**
 * The complete events in `buffer`, by the event-stream rules of the HTML standard: comment lines
 * (`:`) and `retry` are skipped, `data` lines join with a line feed, a block without data is no
 * event. Only text up to the last blank line is consumed, so a line end split between two chunks
 * (CR in one, LF in the next) is read the same as in one piece.
 */
export function parseEventStream(buffer: string): ParsedStream {
  const events: StreamEvent[] = [];
  let consumed = 0;
  let start = 0;
  let type = '';
  let data: string[] = [];
  let id: string | undefined;
  for (const found of buffer.matchAll(LINE_END)) {
    const line = buffer.slice(start, found.index);
    start = found.index + found[0].length;
    if (line === '') {
      if (data.length > 0) {
        const event = { event: type === '' ? 'message' : type, data: data.join('\n') };
        events.push(id === undefined ? event : { ...event, id });
      }
      type = '';
      data = [];
      id = undefined;
      consumed = start;
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\u0000')) id = value;
  }
  return { events, rest: buffer.slice(consumed) };
}

/** The pause before reconnect number `attempt` (0 is the first): 2 s, 4, 8, 16, then 30 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** Math.max(0, attempt), MAX_DELAY_MS);
}

/** Waits `ms`, or less when `signal` aborts. Never rejects. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const waiting = new AbortController();
    const timer = setTimeout(() => {
      waiting.abort();
      resolve();
    }, ms);
    const stop = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', stop, { once: true, signal: waiting.signal });
  });
}

/** A handler's bug is reported and the stream goes on; it is no reason to reconnect. */
function deliver(onEvent: (event: StreamEvent) => void, event: StreamEvent): void {
  try {
    onEvent(event);
  } catch (error) {
    reportError(error);
  }
}

type Connection = {
  url: string;
  signal: AbortSignal;
  /** The id of the last event that had one; sent as `Last-Event-ID` when not empty. */
  lastId: string;
  onOpen(): void;
  onEvent(event: StreamEvent): void;
};

/** One request: it returns when the stream ends or is refused, and throws on network errors. */
async function readOnce(connection: Connection): Promise<void> {
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  if (connection.lastId !== '') headers['Last-Event-ID'] = connection.lastId;
  const response = await fetch(connection.url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    signal: connection.signal,
  });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || response.body === null || !type.startsWith('text/event-stream')) {
    await response.body?.cancel();
    return;
  }
  connection.onOpen();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      const parsed = parseEventStream(buffer + decoder.decode(chunk.value, { stream: true }));
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.id !== undefined) connection.lastId = event.id;
        connection.onEvent(event);
      }
      if (buffer.length > MAX_PENDING) return;
      chunk = await reader.read();
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/**
 * Reads the event stream at `url` until `signal` aborts, reconnecting after 2 s, 4, 8, up to 30 s
 * and sending `Last-Event-ID`, so the studio replays what was missed (or sends `reset`). The pause
 * starts again at 2 s after a stream opened. Never rejects.
 */
export async function readEvents(
  url: string,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let attempt = 0;
  const connection: Connection = {
    url,
    signal,
    lastId: '',
    onOpen: () => {
      attempt = 0;
    },
    onEvent: (event) => deliver(onEvent, event),
  };
  while (!signal.aborted) {
    try {
      await readOnce(connection);
    } catch {
      // The network failed or the stream broke: the pause below, then a new request.
    }
    if (signal.aborted) return;
    await pause(reconnectDelay(attempt), signal);
    attempt += 1;
  }
}
