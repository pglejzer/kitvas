// The prototype origin: built files of drafts and kit examples behind the frame key, with the sandbox policy.

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { type DraftStore, readOptions, versionFolder } from '../../drafts/index.ts';
import { catalogDir, KitvasError, type Translate } from '../../shared/index.ts';
import { catalogBuildDir } from '../frame/catalog-files.ts';
import { frameFile, SERVED_PREVIEWS, type Served } from '../frame/frame-files.ts';
import { pageWithChoice } from '../frame/frame-page.ts';
import { type FrameAddress, parseFrameAddress } from '../frame/frame-url.ts';
import { problemReply, RequestError } from '../http/problem.ts';
import { send } from '../http/reply.ts';
import type { DeniedLog } from '../security/denied-log.ts';
import { safeSegments } from '../security/file-paths.ts';
import { frameSiteAllowed } from '../security/request-checks.ts';
import { frameHeaders } from '../security/response-headers.ts';
import { secretMatches } from '../security/token.ts';
import { checkTransport, requestTarget } from './transport.ts';

export type FrameContext = {
  drafts: DraftStore;
  /** The project folder, where the kits' built examples are; without it `/k/...` finds nothing. */
  project: string | undefined;
  /** The path part every file address starts with, new on each start. */
  key: string;
  port: number;
  studioPort: number;
  t: Translate;
  onError: ((error: unknown) => void) | undefined;
  /** Logs the refusals. */
  denied: DeniedLog | undefined;
};

/** The folder an address's files are below; a catalog address without a project has none. */
type Root = { dir: string; served?: Served };

/**
 * A draft version's `build/`, a kit catalog's `build/`, or for `previews/…` the kit's catalog
 * folder itself, where the Insert pane's previews sit beside `build/` (ADR 0075).
 */
function rootOf(ctx: FrameContext, found: FrameAddress): Root | undefined {
  if (found.kind === 'draft') {
    return { dir: join(ctx.drafts.dir(found.slug), versionFolder(found.version), 'build') };
  }
  if (ctx.project === undefined) return undefined;
  const [folder] = found.relPath.split('/');
  if (folder !== undefined && SERVED_PREVIEWS.dirs.includes(folder)) {
    return { dir: catalogDir(ctx.project, found.kitId), served: SERVED_PREVIEWS };
  }
  return { dir: catalogBuildDir(ctx.project, found.kitId) };
}

function serve(
  ctx: FrameContext,
  req: IncomingMessage,
  res: ServerResponse,
  headers: Record<string, string>,
  head: boolean,
): void {
  checkTransport(req, ctx.port, ctx.t);
  const { path, query } = requestTarget(req, ctx.t);
  if (req.method !== 'GET' && !head) {
    const method = req.method ?? '';
    throw new RequestError(
      'METHOD_NOT_ALLOWED',
      { method, path },
      { headers: { allow: 'GET, HEAD' } },
    );
  }
  if (!frameSiteAllowed(req.headers)) {
    throw new RequestError('REQUEST_FORBIDDEN', { detail: ctx.t('studio.deny.site') });
  }
  const segments = safeSegments(path);
  const found = segments && parseFrameAddress(segments);
  if (!found) throw new RequestError('ROUTE_NOT_FOUND', { path: '/' });
  // A wrong key answers the same as a missing file.
  const root = secretMatches(found.key, ctx.key) ? rootOf(ctx, found) : undefined;
  const file = root === undefined ? undefined : frameFile(root.dir, found.relPath, root.served);
  if (!file) throw new RequestError('ROUTE_NOT_FOUND', { path: found.relPath });
  // Stage 4c (ADR 0055): the frame reads its own stylesheets' rules to make the forced-state twins.
  // Its opaque origin makes that a cross-origin read, so a sheet allows it; the key still guards it.
  const sheet = file.type.startsWith('text/css');
  const own = sheet ? { ...headers, 'access-control-allow-origin': '*' } : headers;
  send(res, { status: 200, type: file.type, body: bodyOf(ctx, found, file, query) }, own, head);
}

/** A draft's page carries the chosen options on its root (`frame-page.ts`); other files as stored. */
function bodyOf(
  ctx: FrameContext,
  found: FrameAddress,
  file: { file: string; type: string },
  query: URLSearchParams,
): Buffer | string {
  if (found.kind !== 'draft' || !file.type.startsWith('text/html')) return readFileSync(file.file);
  const options = readOptions(ctx.drafts, found.slug, versionFolder(found.version));
  return pageWithChoice(readFileSync(file.file, 'utf8'), options, query);
}

export function handleFrame(ctx: FrameContext, req: IncomingMessage, res: ServerResponse): void {
  const headers = frameHeaders(ctx.studioPort, ctx.port);
  const head = req.method === 'HEAD';
  let code: string | undefined;
  res.once('finish', () => ctx.denied?.(req, res.statusCode, code));
  try {
    serve(ctx, req, res, headers, head);
  } catch (cause) {
    if (cause instanceof KitvasError) code = cause.code;
    send(res, problemReply(cause, ctx.t, ctx.onError), headers, head);
  }
}
