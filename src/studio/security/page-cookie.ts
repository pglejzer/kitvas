// The cookie that lets a browser into the studio's pages. Cookies ignore ports, so its name
// carries the port: two studios on one machine keep their own.

export const cookieName = (port: number): string => `kitvas_${port}`;

/**
 * 30 days in seconds. The secret is kept per project (ADR 0040), so a bookmark and an open tab keep
 * working across restarts of the studio for that long.
 */
export const COOKIE_MAX_AGE_S = 2_592_000;

/** `HttpOnly` keeps it from scripts, `SameSite=Strict` from requests other sites start. */
export function pageCookieHeader(port: number, secret: string): string {
  const name = cookieName(port);
  return `${name}=${secret}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Strict`;
}

/** The value of cookie `name` in a Cookie header; `undefined` when it is missing or given twice. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  let found: string | undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at === -1 || part.slice(0, at).trim() !== name) continue;
    if (found !== undefined) return undefined;
    found = part.slice(at + 1).trim();
  }
  return found;
}
