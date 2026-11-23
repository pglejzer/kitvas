// The address a studio page frames a version at, on the prototype origin.

import { catalogFrameUrl, catalogRefUrl, frameUrl } from '../frame/frame-url.ts';

/** The prototype origin: its port and the key every file address starts with. */
export type FrameOrigin = { port: number; key: string };

/** The address of one built example of a kit, on the same host name as the page. */
export function catalogSrc(
  frame: FrameOrigin,
  host: string,
  target: { kitId: string; example: string },
): string {
  const hostname = host.slice(0, host.lastIndexOf(':'));
  return catalogFrameUrl({ hostname, port: frame.port, key: frame.key, ...target });
}

/** The address of a copied reference image of a kit's catalog. */
export function catalogRefSrc(
  frame: FrameOrigin,
  host: string,
  target: { kitId: string; file: string },
): string {
  const hostname = host.slice(0, host.lastIndexOf(':'));
  return catalogRefUrl({ hostname, port: frame.port, key: frame.key, ...target });
}

export function frameSrc(
  frame: FrameOrigin,
  host: string,
  target: { slug: string; version: number; state: string },
): string {
  // The frame uses the host name of this request, so the two origins stay the same site.
  const hostname = host.slice(0, host.lastIndexOf(':'));
  return frameUrl({ hostname, port: frame.port, key: frame.key, ...target });
}
