// What `kit exports` makes of the names a kit's source exports (ADR 0081): the component names
// among them, the ones the kit has, and the ones still open. Pure; kit.json is read leniently,
// because a kit is listed before its components are learned.

import { isRecord } from '../../../shared/index.ts';

/** An exported name that counts: upper case first, then letters and digits, like a component. */
export const EXPORT_NAME = /^[A-Z][A-Za-z0-9]*$/;

const SCRIPT = /\.(?:tsx|ts|jsx|js|mjs)$/;
/** Types, tests and stories hold no component of the folder. */
const NO_COMPONENT = /(?:\.d\.ts|\.(?:test|spec|stories|story)\.[a-z]+)$/;
const SKIPPED_FOLDER = /(?:^|\/)__(?:tests|mocks)__\//;

/** True for a file of a repo kit's folder that `kit exports` reads: a script, not a test or a type. */
export const isSourceModule = (path: string): boolean =>
  SCRIPT.test(path) && !NO_COMPONENT.test(path) && !SKIPPED_FOLDER.test(path);

export type ExportsSplit = {
  /** `covered.length + open.length`. */
  total: number;
  /** Exported names that are a component of the kit or one of a component's `parts`. */
  covered: string[];
  /** The other exported names, but those `gaps` holds as `unsupported`. */
  open: string[];
};

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Splits the exported `names` by the kit's own kit.json (never its additions): a component's name
 * or a name in its `parts` is covered, a name that a gap holds with `unsupported` is left out, the
 * rest is open. Each list sorted, each name once.
 */
export function splitExports(names: readonly string[], kitJson: unknown): ExportsSplit {
  const json = isRecord(kitJson) ? kitJson : {};
  const known = new Set<string>();
  for (const entry of listOf(json.components)) {
    if (!isRecord(entry)) continue;
    if (typeof entry.name === 'string') known.add(entry.name);
    for (const part of listOf(entry.parts)) if (typeof part === 'string') known.add(part);
  }
  const unsupported = new Set<string>();
  for (const gap of listOf(json.gaps)) {
    if (isRecord(gap) && gap.reason === 'unsupported' && typeof gap.path === 'string') {
      unsupported.add(gap.path);
    }
  }
  const counted = [...new Set(names)].filter((name) => EXPORT_NAME.test(name)).sort();
  const covered = counted.filter((name) => known.has(name));
  const open = counted.filter((name) => !known.has(name) && !unsupported.has(name));
  return { total: covered.length + open.length, covered, open };
}
