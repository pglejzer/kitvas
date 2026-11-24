// Every request of a scan passes the person's policy: the page, its frames, everything they load and
// every redirect on the way. The browser does not call a route handler again for a redirect it
// follows by itself, so each request is fetched here without following redirects, the target of a
// redirect is judged before the browser sees it, and the browser's request for that target comes
// through here once more (judged twice, which costs nothing).

import type { ScanPolicy } from '../../ports/browser.ts';

type BrowserContext = import('playwright-core').BrowserContext;
type Frame = import('playwright-core').Frame;
type Request = import('playwright-core').Request;
type Route = import('playwright-core').Route;
type Answer = import('playwright-core').APIResponse<unknown>;

/** What happened to the page's own document (the main frame's navigations). */
export type Guard = {
  /** The first URL of the page's document the policy refused, a redirect target included. */
  refused: string | undefined;
  /** Why the page's document could not be fetched or judged; undefined when nothing failed. */
  failure: unknown;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** URLs the browser makes from what it already holds; nothing leaves the machine. */
const LOCAL_SCHEMES = new Set(['data:', 'blob:']);
/** Video and audio add nothing to the facts, and each body is held in memory on its way. */
const DROPPED_TYPES = new Set(['media']);
const FETCH_TIMEOUT_MS = 30_000;

type Verdict = 'allowed' | 'refused' | { failure: unknown };

function parse(text: string, base?: URL): URL | undefined {
  try {
    return new URL(text, base);
  } catch {
    return undefined;
  }
}

function headerOf(answer: Answer, name: string): string | undefined {
  return answer.headersArray().find((header) => header.name.toLowerCase() === name)?.value;
}

/**
 * The address the fetch connected to, as a URL the policy can judge; 'unknown' when Playwright
 * does not say. A name may point elsewhere when the fetch looks it up than when the policy did.
 */
async function reachedAddress(answer: Answer, url: URL): Promise<URL | 'unknown' | undefined> {
  const address = await answer.serverAddr().catch(() => null);
  if (address === null) return 'unknown';
  const ip = address.ipAddress.split('%')[0] ?? '';
  return parse(`${url.protocol}//${ip.includes(':') ? `[${ip}]` : ip}/`);
}

/**
 * Routes every request of `context` through `policy`; read the guard after navigating. Called
 * before the page is opened, so `mainFrame` gives the page's frame once there is one.
 */
export async function guardRequests(
  context: BrowserContext,
  policy: ScanPolicy,
  mainFrame: () => Frame | undefined,
): Promise<Guard> {
  const guard: Guard = { refused: undefined, failure: undefined };

  const judge = async (url: URL): Promise<Verdict> => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'refused';
    try {
      return (await policy(url)) ? 'allowed' : 'refused';
    } catch (cause) {
      return { failure: cause };
    }
  };

  const isPageDocument = (request: Request): boolean => {
    try {
      return request.isNavigationRequest() && request.frame() === mainFrame();
    } catch {
      // A request of no frame (a worker's) is never the page's document.
      return false;
    }
  };

  const stop = async (
    route: Route,
    main: boolean,
    url: string,
    verdict: Exclude<Verdict, 'allowed'>,
  ): Promise<void> => {
    if (main && verdict === 'refused') guard.refused ??= url;
    if (main && verdict !== 'refused') guard.failure ??= verdict.failure;
    await route.abort('blockedbyclient').catch(() => undefined);
  };

  const pass = async (route: Route): Promise<void> => {
    const request = route.request();
    const main = isPageDocument(request);
    const url = parse(request.url());
    if (url === undefined) return stop(route, main, request.url(), 'refused');
    if (LOCAL_SCHEMES.has(url.protocol)) return route.continue();
    if (!main && DROPPED_TYPES.has(request.resourceType())) {
      return stop(route, false, url.href, 'refused');
    }
    const asked = await judge(url);
    if (asked !== 'allowed') return stop(route, main, url.href, asked);
    let answer: Answer;
    try {
      answer = await route.fetch<unknown>({ maxRedirects: 0, timeout: FETCH_TIMEOUT_MS });
    } catch (cause) {
      return stop(route, main, url.href, { failure: cause });
    }
    const reached = await reachedAddress(answer, url);
    let where: Verdict = 'allowed';
    if (reached === undefined) where = 'refused';
    else if (reached !== 'unknown') where = await judge(reached);
    if (where !== 'allowed') {
      await answer.dispose().catch(() => undefined);
      return stop(route, main, url.href, where);
    }
    const location = REDIRECTS.has(answer.status()) ? headerOf(answer, 'location') : undefined;
    if (location !== undefined) {
      const target = parse(location, url);
      const next = target ? await judge(target) : 'refused';
      if (next !== 'allowed') {
        await answer.dispose().catch(() => undefined);
        return stop(route, main, target?.href ?? location, next);
      }
    }
    await route.fulfill({ response: answer });
  };

  await context.route(
    () => true,
    async (route) => {
      try {
        await pass(route);
      } catch {
        // The page or its context closed while the request was on its way.
        await route.abort().catch(() => undefined);
      }
    },
  );
  // A web socket is no request the routes see, so none is opened at all.
  await context.routeWebSocket(
    () => true,
    (socket) => socket.close(),
  );
  return guard;
}
