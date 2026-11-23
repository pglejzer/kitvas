// Which Node versions kitvas runs on: patched releases of the 24 and 26 lines, and newer majors.

const FLOORS: Record<number, readonly [number, number]> = { 24: [22, 3], 26: [13, 1] };
const NEWEST_KNOWN_MAJOR = 26;

export function isSupportedNode(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major > NEWEST_KNOWN_MAJOR) return true;
  const floor = FLOORS[major];
  if (!floor) return false;
  return minor > floor[0] || (minor === floor[0] && patch >= floor[1]);
}
