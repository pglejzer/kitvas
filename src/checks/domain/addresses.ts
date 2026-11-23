// Which addresses `kit scan` may visit. A page the person names, and everything it loads or
// redirects to, is judged here before a request goes out. The rules are in the plan of stage 2b:
// private, loopback, link-local, unique-local, multicast and unspecified addresses are refused
// unless the person passes `--allow-private`.

/** Whether a request may go out; the browser port's ScanPolicy has this shape. */
export type RequestPolicy = (url: URL) => Promise<boolean>;

/** Four decimal numbers, as `new URL()` writes an IPv4 host after normalising `127.1` or `2130706433`. */
function parseIPv4(text: string): [number, number, number, number] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  const [a, b, c, d] = parts;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  if (parts.some((part) => part > 255)) return undefined;
  return [a, b, c, d];
}

function privateIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a >= 224;
}

/** The eight 16-bit groups of an IPv6 address; undefined when the text is not one. */
function parseIPv6(text: string): number[] | undefined {
  let rest = text;
  const zone = rest.indexOf('%');
  if (zone >= 0) rest = rest.slice(0, zone);

  // An IPv4 tail (`::ffff:127.0.0.1`) is two groups.
  const lastColon = rest.lastIndexOf(':');
  const tail = rest.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return undefined;
    const high = (v4[0] << 8) | v4[1];
    const low = (v4[2] << 8) | v4[3];
    rest = `${rest.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = rest.split('::');
  if (halves.length > 2) return undefined;
  const toGroups = (part: string): number[] | undefined => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return undefined;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? '');
  if (!head) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const end = toGroups(halves[1] ?? '');
  if (!end) return undefined;
  const missing = 8 - head.length - end.length;
  if (missing < 1) return undefined;
  return [...head, ...new Array<number>(missing).fill(0), ...end];
}

/** The IPv4 address held in the last two groups. */
const embedded = (groups: number[]): [number, number, number, number] => {
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return [high >> 8, high & 255, low >> 8, low & 255];
};

function privateIPv6(groups: number[]): boolean {
  const first = groups[0] ?? 0;
  const zeroUpTo = (count: number): boolean => groups.slice(0, count).every((group) => group === 0);
  // `::`, `::1` and the deprecated IPv4-compatible form `::a.b.c.d`.
  if (zeroUpTo(6)) return privateIPv4(embedded(groups));
  // IPv4-mapped `::ffff:a.b.c.d` is judged by its IPv4.
  if (zeroUpTo(5) && groups[5] === 0xffff) return privateIPv4(embedded(groups));
  // NAT64 `64:ff9b::/96` carries an IPv4 too.
  if (first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return privateIPv4(embedded(groups));
  }
  // 6to4 `2002:aabb:ccdd::` carries one in groups 1 and 2.
  if (first === 0x2002) {
    const high = groups[1] ?? 0;
    const low = groups[2] ?? 0;
    return privateIPv4([high >> 8, high & 255, low >> 8, low & 255]);
  }
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7, unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10, site-local (deprecated)
  return (first & 0xff00) === 0xff00; // ff00::/8, multicast
}

/**
 * True for an address a scan must not visit without `--allow-private`. Text that is not an IP
 * address at all counts as private: when in doubt, refuse.
 */
export function isPrivateAddress(ip: string): boolean {
  const text = ip.trim().replace(/^\[|\]$/g, '');
  const v4 = parseIPv4(text);
  if (v4) return privateIPv4(v4);
  const v6 = parseIPv6(text);
  return v6 ? privateIPv6(v6) : true;
}

/**
 * The request policy of a scan. `lookup` resolves a name to all of its addresses; it is called once
 * per host for the run. Only `http:` and `https:` without user info are allowed. `new URL()` has
 * already turned `127.1`, `2130706433` and `0x7f.1` into `127.0.0.1`, and writes an IPv6 host in
 * brackets, so a literal is judged here as the address it is.
 */
export function scanPolicy(
  lookup: (host: string) => Promise<string[]>,
  allowPrivate: boolean,
): RequestPolicy {
  const names = new Map<string, Promise<boolean>>();

  const nameAllowed = (name: string): Promise<boolean> => {
    const known = names.get(name);
    if (known) return known;
    const answer = lookup(name).then(
      // Any private address among several makes the name private: the browser may pick that one.
      (addresses) => addresses.length > 0 && !addresses.some(isPrivateAddress),
      () => false,
    );
    names.set(name, answer);
    return answer;
  };

  return async (url) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username !== '' || url.password !== '') return false;
    if (allowPrivate) return true;

    const host = url.hostname.toLowerCase().replace(/\.+$/, '');
    if (host === '') return false;
    if (host.startsWith('[')) return !isPrivateAddress(host);
    if (parseIPv4(host)) return !isPrivateAddress(host);
    // `localhost` and its subdomains name the machine itself whatever a resolver says.
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    return nameAllowed(host);
  };
}
