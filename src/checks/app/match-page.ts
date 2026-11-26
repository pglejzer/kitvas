// Use case: the person's page shot and set beside a reference, for `kitvas handoff compare`. It
// builds the policy the browser judges every request and redirect by. The person names this address
// to look at their own page, so a loopback address (`localhost`, `127.0.0.0/8`, `::1`) is allowed
// without a flag, which the scan policy of `kit scan` refuses; any other private address needs
// `allowPrivate`. Whatever is not allowed ends `blocked`, before a browser is started when the
// first address already is.

import { KitvasError } from '../../shared/index.ts';
import { scanPolicy } from '../domain/scan/addresses.ts';
import type { Browser, Match, MatchReport, ScanPolicy } from '../ports/browser.ts';

export type MatchDeps = {
  browser: Browser;
  /** All addresses of a host name; rejects when it does not resolve. */
  lookup(host: string): Promise<string[]>;
};

export type MatchInput = Omit<Match, 'policy'> & {
  /** Visit private network addresses that are not loopback too. */
  allowPrivate: boolean;
};

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const LOOPBACK_V4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

/** True for the machine itself: `localhost` and its subdomains, 127.0.0.0/8 and `::1`. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]') return true;
  return LOOPBACK_V4.test(host);
}

/** The scan policy with the machine itself allowed; http and https only, no user info, always. */
export function matchPolicy(
  lookup: (host: string) => Promise<string[]>,
  allowPrivate: boolean,
): ScanPolicy {
  const general = scanPolicy(lookup, allowPrivate);
  return async (url) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username !== '' || url.password !== '') return false;
    if (isLoopbackHost(url.hostname)) return true;
    return general(url);
  };
}

function parse(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

/**
 * Opens the address in a browser under the policy and answers what `match` answers. An address
 * that is not a URL, or that the policy refuses, is `blocked` and no browser is started.
 * Throws BROWSER_MISSING when no browser starts or the session cannot compare.
 */
export async function matchPage(deps: MatchDeps, input: MatchInput): Promise<MatchReport> {
  const { allowPrivate, ...match } = input;
  const policy = matchPolicy(deps.lookup, allowPrivate);
  const url = parse(input.url);
  if (url === undefined || !(await policy(url))) return { state: 'blocked', url: input.url };
  const session = await deps.browser.open();
  try {
    if (!session.match) throw new KitvasError('BROWSER_MISSING');
    return await session.match({ ...match, policy });
  } finally {
    await session.close();
  }
}
