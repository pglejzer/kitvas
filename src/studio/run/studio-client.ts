// Calls a running studio from the CLI: its Host, the token and, for changes, the studio's own Origin.

import { request } from 'node:http';

export type StudioAddress = { port: number; token: string };

export type StudioCall = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  timeoutMs: number;
};

export type StudioAnswer = { status: number; body: unknown };

export function callStudio(address: StudioAddress, call: StudioCall): Promise<StudioAnswer> {
  const host = `127.0.0.1:${address.port}`;
  const body = call.body === undefined ? undefined : JSON.stringify(call.body);
  const headers: Record<string, string> = { host, authorization: `Bearer ${address.token}` };
  if (call.method !== 'GET') headers.origin = `http://${host}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: address.port,
        method: call.method,
        path: call.path,
        headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = text;
          try {
            parsed = text === '' ? undefined : JSON.parse(text);
          } catch {
            // Not JSON: the text itself.
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on('error', reject);
      },
    );
    req.setTimeout(call.timeoutMs, () => {
      req.destroy(new Error(`no answer within ${call.timeoutMs} ms`));
    });
    req.on('error', reject);
    req.end(body);
  });
}
