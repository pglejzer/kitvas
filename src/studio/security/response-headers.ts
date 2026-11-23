// Headers on every response of the two origins, errors included.

import { HOST_NAMES } from './host-names.ts';

const COMMON = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), usb=(), payment=(), display-capture=()',
  vary: 'Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest',
  'cache-control': 'no-store',
};

/** `port` under every name the studio answers to: a page frames the host name it came to. */
const loopback = (port: number): string =>
  HOST_NAMES.map((name) => `http://${name}:${port}`).join(' ');

/** The studio's pages and API: inline style and script only with the response's nonce. */
export function studioHeaders(nonce: string, framePort: number): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    // The prototype origin serves the reference images a kit page shows beside its frames.
    `img-src 'self' data: ${loopback(framePort)}`,
    `frame-src ${loopback(framePort)}`,
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    ...COMMON,
    'content-security-policy': csp,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
  };
}

/**
 * The prototype origin. `sandbox` gives the page an opaque origin, so its own files load as
 * cross-origin requests: the resource policy has to allow that, and the frame key guards them.
 */
export function frameHeaders(studioPort: number, framePort: number): Record<string, string> {
  const self = loopback(framePort);
  const csp = [
    'sandbox allow-scripts',
    "default-src 'none'",
    `script-src ${self}`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `frame-ancestors ${loopback(studioPort)}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    ...COMMON,
    'content-security-policy': csp,
    'cross-origin-resource-policy': 'cross-origin',
  };
}
