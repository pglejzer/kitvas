// A studio over a temp workspace, and two ways to call it: node:http and raw bytes.

import { request } from 'node:http';
import { connect } from 'node:net';
import type { DraftStore } from '../../src/drafts/index.ts';
import {
  type Studio,
  type StudioDeps,
  type StudioOptions,
  startStudio,
} from '../../src/studio/index.ts';
import type { StudioAssets } from '../../src/studio/pages/asset-routes.ts';
import { shopDraft } from './drafts.ts';
import { builtinKits } from './kits.ts';
import { tempDir } from './tmp.ts';
import { t } from './translate.ts';

export type Answer = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
};

/** Build output of `shop` v1 without a real build: enough for the prototype origin to serve. */
export function writeFakeBuild(store: DraftStore): void {
  store.writeText('shop', 'v1/build/html/index.html', '<!doctype html><title>Shop</title>');
  store.writeText('shop', 'v1/build/js/index.js', 'document.title = "x";');
  store.writeText('shop', 'v1/build/css/index.css', 'body { margin: 0; }');
  store.writeText('shop', 'v1/build/json/ids.json', '{}');
}

/** Scripts that need no bundler: every page script is an empty module, every font a few bytes. */
export const fakeAssets: StudioAssets = {
  script: () => Promise.resolve('export {};'),
  font: () => Promise.resolve(Buffer.from('wOF2-fake')),
};

/** A studio over `drafts`; errors kitvas did not raise are collected in `errors`. */
export async function studioOver(
  drafts: DraftStore,
  options: StudioOptions = {},
  extra: Partial<StudioDeps> = {},
) {
  const errors: unknown[] = [];
  // The project folder is where a kit's built examples would be.
  const project = extra.project ?? tempDir('kitvas-project-');
  const studio = await startStudio(
    {
      drafts,
      project,
      kits: builtinKits(),
      t,
      assets: fakeAssets,
      version: '0.1.0',
      onError: (error) => errors.push(error),
      ...extra,
    },
    options,
  );
  return { studio, errors, project };
}

/** A studio over a workspace with the `shop` draft and its fake build. */
export async function shopStudio(options: StudioOptions = {}, extra: Partial<StudioDeps> = {}) {
  const { store } = shopDraft();
  writeFakeBuild(store);
  return { store, ...(await studioOver(store, options, extra)) };
}

export type CallInput = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

/** One request on its own connection; Host is the server's own unless given. */
export function call(port: number, input: CallInput): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: input.method ?? 'GET',
        path: input.path,
        agent: false,
        headers: {
          host: `127.0.0.1:${port}`,
          // Node sends no length of its own for a DELETE, and a body without one is not read.
          ...(input.body === undefined
            ? {}
            : { 'content-length': String(Buffer.byteLength(input.body)) }),
          ...input.headers,
        },
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
    req.on('error', reject);
    req.end(input.body);
  });
}

/** A one-time link to `path` of `studio`, asked for the way the CLI asks. */
export async function openLinkUrl(studio: Studio, path = '/'): Promise<string> {
  const answer = await call(studio.port, {
    method: 'POST',
    path: '/api/v1/links',
    headers: {
      authorization: `Bearer ${studio.token}`,
      origin: studio.url,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  return (JSON.parse(answer.text) as { url: string }).url;
}

/** The page cookie of `studio` (`name=value`), got the way a browser gets it. */
export async function pageCookie(studio: Studio, path = '/'): Promise<string> {
  const link = new URL(await openLinkUrl(studio, path));
  const opened = await call(studio.port, { path: `${link.pathname}${link.search}` });
  const header = opened.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return (first ?? '').split(';')[0] ?? '';
}

/** A raw request: lines joined with CRLF, an empty line, then the body. */
export const raw = (lines: string[], body = ''): string => `${lines.join('\r\n')}\r\n\r\n${body}`;

function parseAnswer(text: string): Answer {
  const split = text.indexOf('\r\n\r\n');
  const head = (split === -1 ? text : text.slice(0, split)).split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of head.slice(1)) {
    const at = line.indexOf(':');
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return {
    status: Number(head[0]?.split(' ')[1] ?? 0),
    headers,
    text: split === -1 ? '' : text.slice(split + 4),
  };
}

/** Sends bytes as they are, for requests node:http refuses to make, and reads until the server closes. */
export function rawCall(port: number, text: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    const answer = (): Answer => parseAnswer(Buffer.concat(chunks).toString('utf8'));
    socket.setTimeout(5_000, () => socket.destroy(new Error('no answer within 5 s')));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => resolve(answer()));
    socket.on('error', (error) => (chunks.length > 0 ? resolve(answer()) : reject(error)));
    socket.write(text);
  });
}
