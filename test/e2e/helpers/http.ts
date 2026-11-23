// Calls to a running studio over node:http: only the headers given here are sent (no Fetch
// Metadata), redirects are never followed and Set-Cookie comes back as the server wrote it.

import { type IncomingHttpHeaders, request } from 'node:http';

const CALL_TIMEOUT_MS = 15_000;

export type Reply = { status: number; headers: IncomingHttpHeaders; text: string };

export type CallInput = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

/**
 * One request to an absolute address; Host is the address's own, the fragment is never sent. A
 * `*.localhost` name goes to 127.0.0.1 as a browser sends it: the system's resolver may not know
 * such names, and the studio prints `kitvas.localhost`.
 */
export function call(address: string, input: CallInput = {}): Promise<Reply> {
  const url = new URL(address);
  const method = input.method ?? 'GET';
  const headers: Record<string, string> = { host: url.host, ...input.headers };
  if (input.body !== undefined) headers['content-length'] = String(Buffer.byteLength(input.body));
  const timeoutMs = input.timeoutMs ?? CALL_TIMEOUT_MS;
  const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost');
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: loopback ? '127.0.0.1' : url.hostname,
        port: Number(url.port),
        method,
        path: `${url.pathname}${url.search}`,
        headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`${method} ${url.pathname}: no answer within ${timeoutMs} ms`));
    });
    req.on('error', reject);
    req.end(input.body);
  });
}

/** `name=value` of the first Set-Cookie, the part a browser sends back. */
export function cookieOf(reply: Reply): string {
  const header = reply.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return (first ?? '').split(';')[0]?.trim() ?? '';
}

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
};

/** Undoes the studio's escaping of attribute values (`pages/html.ts`). */
export const unescapeHtml = (text: string): string =>
  text.replace(/&(?:quot|#39|lt|gt|amp);/g, (entity) => ENTITIES[entity] ?? entity);

/** The attributes of every `<iframe>` of a page, values unescaped. */
export function iframes(html: string): Record<string, string>[] {
  return [...html.matchAll(/<iframe\b([^>]*)>/g)].map((match) => {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[1] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1] ?? ''] = unescapeHtml(attribute[2] ?? '');
    }
    return attributes;
  });
}

/** The opening tag of the page's `<main>`, where the pages keep their data attributes. */
export function mainTag(html: string): string {
  return /<main\b[^>]*>/.exec(html)?.[0] ?? '';
}

/** Asks `check` every `everyMs` until it gives a value; fails once `timeoutMs` is over. */
export async function poll<T>(
  check: () => Promise<T | undefined>,
  timeoutMs: number,
  everyMs = 250,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error(`nothing within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}
