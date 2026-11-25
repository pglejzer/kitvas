// What a Versions row says of a version besides its number (plan 18f, task 1; spec 4.2): a
// thumbnail (the check's screenshot, when the full check made it), and a status line: "N changes,
// not saved" for now, "Saved HH:MM · All good | N to fix | Not checked" for a saved version. Pure,
// so a version with no build, no shot or no check is tested without a DOM.

/** What the studio knows of one version: `GET /api/v1/drafts/{slug}/versions/{n}` (`VersionSchema`). */
export type VersionFacts = {
  number: number;
  createdAt: string;
  /** The screenshot below the version's `build/`: `shots/filled-1280.png`; `null` without one. */
  shot: string | null;
  /** The last full check's counts; `null` when the version was never checked. */
  check: { fix: number; review: number } | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** The shot's path as the server sends it: below `build/`, one PNG in `shots/`. */
const SHOT = /^shots\/[A-Za-z0-9._-]{1,100}\.png$/;

/** The server's answer read from `unknown`; `null` when it is not the shape the route promises. */
export function factsOf(raw: unknown): VersionFacts | null {
  if (!isRecord(raw)) return null;
  const { number, createdAt, shot, check } = raw;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return null;
  if (typeof createdAt !== 'string') return null;
  return {
    number,
    createdAt,
    shot: typeof shot === 'string' && SHOT.test(shot) ? shot : null,
    check: countsOf(check),
  };
}

function countsOf(raw: unknown): VersionFacts['check'] {
  if (!isRecord(raw)) return null;
  const { fix, review } = raw;
  return isCount(fix) && isCount(review) ? { fix, review } : null;
}

/** How a saved version's check reads: nothing run, no findings, or what is left to do. */
export type CheckLine =
  | { kind: 'none' }
  | { kind: 'good' }
  | { kind: 'fix'; count: number }
  | { kind: 'review'; count: number };

export type VersionLine =
  | { kind: 'now'; changes: number }
  | { kind: 'saved'; time: string | null; check: CheckLine };

export function checkLine(check: VersionFacts['check'] | undefined): CheckLine {
  if (check === null || check === undefined) return { kind: 'none' };
  if (check.fix > 0) return { kind: 'fix', count: check.fix };
  if (check.review > 0) return { kind: 'review', count: check.review };
  return { kind: 'good' };
}

/**
 * `HH:MM` of an ISO time on the person's clock. `offset` is minutes behind UTC (a date's
 * `getTimezoneOffset`); left out, the time's own zone offset is used. `null` for a bad date.
 */
export function clockOf(iso: string, offset?: number): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const behind = offset ?? at.getTimezoneOffset();
  const local = new Date(at.getTime() - behind * 60_000);
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`;
}

/**
 * The status line of one row. `now`: the version the editor edits, with `changes` not saved yet;
 * a saved version says when it was saved and what its check found.
 */
export function versionLine(
  facts: VersionFacts | undefined,
  now: boolean,
  changes: number,
  offset?: number,
): VersionLine {
  if (now) return { kind: 'now', changes };
  return {
    kind: 'saved',
    time: facts === undefined ? null : clockOf(facts.createdAt, offset),
    check: checkLine(facts?.check),
  };
}

/** The frame's path of a draft's version: `/f/<key>/<slug>/v<n>/…` (`src/studio/frame/frame-url.ts`). */
const FRAME_PATH = /^(\/f\/[^/]+\/[^/]+\/)v[1-9][0-9]{0,5}\/.*$/;

/**
 * The address of a version's screenshot on the prototype origin, from the address of any card's
 * frame (the same origin and key). `null` for no shot, no frame or an address that is no draft's.
 */
export function shotAddress(
  frameSrc: string | undefined,
  version: number,
  shot: string | null,
): string | null {
  if (frameSrc === undefined || shot === null) return null;
  try {
    const url = new URL(frameSrc);
    const match = FRAME_PATH.exec(url.pathname);
    if (!match) return null;
    return `${url.origin}${match[1] ?? ''}v${version}/${shot}`;
  } catch {
    return null;
  }
}
