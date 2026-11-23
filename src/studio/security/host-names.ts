// The names the studio answers to (ADR 0040). Both servers listen on 127.0.0.1 only; browsers
// resolve every `*.localhost` name to loopback by themselves (RFC 6761), so the studio gets a name
// of its own without a hosts file. Safari before macOS 26 does not, so each printed link also comes
// on `localhost`.

/** The name kitvas prints and builds addresses with. */
export const STUDIO_HOST = 'kitvas.localhost';

/** The name of the fallback link: every browser resolves it. */
export const FALLBACK_HOST = 'localhost';

/**
 * Every name a request may come to, in lower case. A Host check compares the whole name with its
 * port, so a rebinding name such as `kitvas.localhost.evil.example` never passes.
 */
export const HOST_NAMES: readonly string[] = ['127.0.0.1', FALLBACK_HOST, STUDIO_HOST];

/** `http://kitvas.localhost:<port>`: the address a person opens and bookmarks. */
export const studioUrl = (port: number): string => `http://${STUDIO_HOST}:${port}`;

/** `http://localhost:<port>`: the same studio, for a browser that cannot resolve the name above. */
export const fallbackStudioUrl = (port: number): string => `http://${FALLBACK_HOST}:${port}`;
