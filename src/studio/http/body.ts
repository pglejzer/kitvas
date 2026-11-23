// Reads a request body that must be JSON: the right media type, within the size limit, parseable.

import type { IncomingMessage } from 'node:http';
import type { Translate } from '../../shared/index.ts';
import { RequestError } from './problem.ts';

/** The studio's requests are small JSON documents. */
export const BODY_LIMIT = 64 * 1024;

function mediaType(header: string | undefined): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function tooLarge(limit: number): RequestError {
  // The rest of the body stays unread, so the connection cannot carry another request.
  return new RequestError('BODY_TOO_LARGE', { limit }, { headers: { connection: 'close' } });
}

function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    function stop(): void {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    }
    function onData(chunk: Buffer): void {
      size += chunk.length;
      if (size <= limit) {
        chunks.push(chunk);
        return;
      }
      stop();
      req.pause();
      reject(tooLarge(limit));
    }
    function onEnd(): void {
      stop();
      resolve(Buffer.concat(chunks));
    }
    function onError(error: Error): void {
      stop();
      reject(error);
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** The parsed body: 415 for another media type, 413 over `limit` bytes, 400 when it is not JSON. */
export async function readJsonBody(
  req: IncomingMessage,
  limit: number,
  t: Translate,
): Promise<unknown> {
  if (mediaType(req.headers['content-type']) !== 'application/json') {
    throw new RequestError('MEDIA_TYPE_UNSUPPORTED');
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw tooLarge(limit);
  const bytes = await readBytes(req, limit);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new RequestError('REQUEST_INVALID', { detail: t('studio.bad.json') });
  }
}
