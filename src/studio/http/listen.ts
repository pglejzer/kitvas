// node:http servers with the studio's limits, on 127.0.0.1 only.

import { createServer, type Server, STATUS_CODES } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { problemType } from './problem.ts';
import { PROBLEM_TYPE } from './reply.ts';

export const LIMITS = {
  requestTimeoutMs: 60_000,
  headersTimeoutMs: 10_000,
  keepAliveTimeoutMs: 5_000,
  maxHeaderSize: 16 * 1024,
  maxHeadersCount: 100,
  maxRequestsPerSocket: 1_000,
} as const;

/** Statuses for parse errors of node:http; anything else is 400. */
const CLIENT_ERROR_STATUS: Record<string, number> = {
  HPE_HEADER_OVERFLOW: 431,
  ERR_HTTP_REQUEST_TIMEOUT: 408,
};

/** A server with the limits and no request handler yet: it is added once both ports are known. */
export function createLimitedServer(): Server {
  const server = createServer({
    requestTimeout: LIMITS.requestTimeoutMs,
    headersTimeout: LIMITS.headersTimeoutMs,
    keepAliveTimeout: LIMITS.keepAliveTimeoutMs,
    maxHeaderSize: LIMITS.maxHeaderSize,
    joinDuplicateHeaders: false,
  });
  server.maxHeadersCount = LIMITS.maxHeadersCount;
  server.maxRequestsPerSocket = LIMITS.maxRequestsPerSocket;
  return server;
}

/** Listens on 127.0.0.1; port 0 takes a free one. Resolves with the port. */
export function listenLoopback(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    // Both listeners go once either fires, so a failed try leaves nothing behind that would
    // answer the next `listen` of the same server.
    const failed = (error: Error): void => {
      server.off('listening', listening);
      reject(error);
    };
    const listening = (): void => {
      server.off('error', failed);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', failed);
    server.once('listening', listening);
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Codes of a port another program holds. Windows also answers `EACCES` for a port in a range it
 * reserved for itself (Hyper-V, WinNAT), which can cover a saved port after a restart.
 */
const PORT_TAKEN = new Set(['EADDRINUSE', 'EACCES']);

/**
 * Listens on `preferred` when it is free, else on a free one: a saved port is a wish, never a
 * reason not to start. Other errors still reject.
 */
export async function listenPreferred(server: Server, preferred: number): Promise<number> {
  try {
    return await listenLoopback(server, preferred);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (!PORT_TAKEN.has(code)) throw error;
    // node:http lets a server listen again after a failed `listen`.
    return listenLoopback(server, 0);
  }
}

/** Stops taking connections; open ones get `graceMs` to finish before they are cut. */
export function closeServer(server: Server, graceMs = 1_000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => server.closeAllConnections(), graceMs);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections();
  });
}

/**
 * Requests node:http cannot parse (a repeated Content-Length, oversized headers, a timeout) get a
 * problem response with the origin's headers, instead of node's bare one.
 */
export function answerClientErrors(
  server: Server,
  headersFor: () => Record<string, string>,
  detail: string,
): void {
  server.on('clientError', (error: Error, socket: Duplex) => {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (code === 'ECONNRESET' || !socket.writable) {
      socket.destroy();
      return;
    }
    const status = CLIENT_ERROR_STATUS[code] ?? 400;
    const title = STATUS_CODES[status] ?? 'Bad Request';
    const body = JSON.stringify({
      type: problemType('REQUEST_INVALID'),
      title,
      status,
      detail,
      code: 'REQUEST_INVALID',
    });
    const headers = {
      ...headersFor(),
      'content-type': PROBLEM_TYPE,
      'content-length': String(Buffer.byteLength(body)),
      connection: 'close',
    };
    const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
    socket.end(`HTTP/1.1 ${status} ${title}\r\n${lines.join('\r\n')}\r\n\r\n${body}`);
  });
}
