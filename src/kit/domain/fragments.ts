// Fragments of a kit (ADR 0081): learners that work at the same time each write one file
// `<kit>/parts/<name>.json` with their components and gaps, and `kit merge` puts them into
// kit.json. Pure rules; the use case reads and writes the files.

import { isRecord, z } from '../../shared/index.ts';
import { ComponentSchema, GapSchema } from './contract.ts';

/** The folder of a kit that holds fragments; no part of the kit, so loading and hashing skip it. */
export const PARTS_DIR = 'parts';
/** A fragment's file name without `.json`. */
export const FRAGMENT_NAME = /^[a-z0-9-]{1,40}$/;
/** At most this many fragments at once. */
export const FRAGMENT_COUNT_MAX = 20;
/** 2 MiB a fragment. */
export const FRAGMENT_BYTES_MAX = 2 * 1024 * 1024;

const FRAGMENT_FILE = /^(.+)\.json$/;
const BYTE_ORDER_MARK = 0xfeff;

/** A fragment: components as kit.json holds them, and gaps; nothing else. */
export const FragmentSchema = z.strictObject({
  components: z.array(ComponentSchema),
  gaps: z.array(GapSchema).optional(),
});

/** A problem of one fragment, or of the `parts/` folder, with a message key (`kitIssue.<name>`). */
export type FragmentIssue = {
  /** The fragment's name, its file without `.json`; `''` for the folder as a whole. */
  fragment: string;
  /** Where in the fragment, `components.3.examples.0.title`; `''` for the whole file. */
  path: string;
  key: string;
  params: Record<string, string | number>;
};

/** A fragment that passed the checks: each entry as it was written, with its name or path. */
export type Fragment = {
  name: string;
  components: { name: string; entry: unknown }[];
  gaps: { path: string; entry: unknown }[];
};

/** What the `parts/` folder holds: its plain files with their size, and everything else. */
export type PartsEntries = {
  files: readonly { name: string; size: number }[];
  other: readonly string[];
};

const issue = (
  fragment: string,
  path: string,
  key: string,
  params: Record<string, string | number>,
): FragmentIssue => ({ fragment, path, key, params });

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringAt = (entry: unknown, key: string): string | undefined => {
  if (!isRecord(entry)) return undefined;
  const value = entry[key];
  return typeof value === 'string' ? value : undefined;
};

export type ListingRead = { names: string[]; issues: FragmentIssue[] };

/**
 * The fragments to read from a listing of `parts/`, in name order, and what is wrong with the
 * listing: an entry that is no `<name>.json` file, a fragment over 2 MiB, more than 20 fragments
 * (then none is read).
 */
export function fragmentListing(entries: PartsEntries): ListingRead {
  const issues: FragmentIssue[] = entries.other.map((name) =>
    issue('', '', 'kitIssue.fragmentFile', { file: name }),
  );
  const names: string[] = [];
  let count = 0;
  for (const file of entries.files) {
    const name = FRAGMENT_FILE.exec(file.name)?.[1];
    if (name === undefined || !FRAGMENT_NAME.test(name)) {
      issues.push(issue('', '', 'kitIssue.fragmentFile', { file: file.name }));
      continue;
    }
    count += 1;
    if (file.size > FRAGMENT_BYTES_MAX) {
      issues.push(
        issue(name, '', 'kitIssue.fragmentTooLarge', { size: file.size, max: FRAGMENT_BYTES_MAX }),
      );
      continue;
    }
    names.push(name);
  }
  if (count > FRAGMENT_COUNT_MAX) {
    issues.push(issue('', '', 'kitIssue.fragmentsTooMany', { count, max: FRAGMENT_COUNT_MAX }));
    return { names: [], issues };
  }
  return { names, issues };
}

export type FragmentCheck =
  | { ok: true; fragment: Fragment }
  | { ok: false; issues: FragmentIssue[] };

/**
 * Checks the text of fragment `name`: JSON, the keys `components` and `gaps` only, every component
 * against the contract's component and every gap against its gap. The contract's own messages are
 * kept (`kitIssue.fragmentContract`), each at its place in the fragment.
 */
export function checkFragment(name: string, text: string): FragmentCheck {
  let raw: unknown;
  // A byte order mark some editors write is no part of the JSON.
  const json = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [issue(name, '', 'kitIssue.fragmentNotJson', { detail })] };
  }
  const parsed = FragmentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((item) =>
        issue(name, item.path.map(String).join('.'), 'kitIssue.fragmentContract', {
          text: item.message,
        }),
      ),
    };
  }
  // The entries go into kit.json as written: no default of the contract is added to them.
  const record = isRecord(raw) ? raw : {};
  const components = listOf(record.components);
  const gaps = listOf(record.gaps);
  return {
    ok: true,
    fragment: {
      name,
      components: parsed.data.components.map((component, index) => ({
        name: component.name,
        entry: components[index],
      })),
      gaps: (parsed.data.gaps ?? []).map((gap, index) => ({ path: gap.path, entry: gaps[index] })),
    },
  };
}

/** A component name written twice, in one fragment or in two: each place after the first. */
export function repeatedComponentNames(fragments: readonly Fragment[]): FragmentIssue[] {
  const first = new Map<string, string>();
  const issues: FragmentIssue[] = [];
  for (const fragment of fragments) {
    for (const [index, component] of fragment.components.entries()) {
      const earlier = first.get(component.name);
      if (earlier === undefined) {
        first.set(component.name, fragment.name);
        continue;
      }
      issues.push(
        issue(fragment.name, `components.${index}.name`, 'kitIssue.fragmentNameTwice', {
          name: component.name,
          other: earlier,
        }),
      );
    }
  }
  return issues;
}

/** What `mergeFragments` gives (another type than `MergedKit` of the additions layer). */
export type FragmentsMerged = {
  /** kit.json with the fragments' components and gaps; every other key as it was. */
  json: Record<string, unknown>;
  /** Names new to the kit, in the order they were added. */
  added: string[];
  /** Names the kit had, whose entry a fragment replaced in place. */
  replaced: string[];
  components: number;
  gaps: number;
};

/**
 * Puts checked fragments into a kit.json: a component whose name the kit has replaces it in place, a
 * new one comes at the end; gaps are joined, one entry a path and the fragment's winning, and a gap
 * whose path is now a component's name is dropped.
 */
export function mergeFragments(
  kitJson: Record<string, unknown>,
  fragments: readonly Fragment[],
): FragmentsMerged {
  const components = [...listOf(kitJson.components)];
  const at = new Map<string, number>();
  for (const [index, entry] of components.entries()) {
    const name = stringAt(entry, 'name');
    if (name !== undefined && !at.has(name)) at.set(name, index);
  }
  const added: string[] = [];
  const replaced: string[] = [];
  const gaps = [...listOf(kitJson.gaps)];
  const gapAt = new Map<string, number>();
  for (const [index, entry] of gaps.entries()) {
    const path = stringAt(entry, 'path');
    if (path !== undefined && !gapAt.has(path)) gapAt.set(path, index);
  }

  for (const fragment of fragments) {
    for (const component of fragment.components) {
      const index = at.get(component.name);
      if (index === undefined) {
        at.set(component.name, components.length);
        components.push(component.entry);
        added.push(component.name);
      } else {
        components[index] = component.entry;
        replaced.push(component.name);
      }
    }
    for (const gap of fragment.gaps) {
      const index = gapAt.get(gap.path);
      if (index === undefined) {
        gapAt.set(gap.path, gaps.length);
        gaps.push(gap.entry);
      } else {
        gaps[index] = gap.entry;
      }
    }
  }

  const kept = gaps.filter((entry) => {
    const path = stringAt(entry, 'path');
    return path === undefined || !at.has(path);
  });
  const json: Record<string, unknown> = { ...kitJson, components };
  // A kit.json without gaps gets the key only when there is a gap to keep.
  if ('gaps' in kitJson || kept.length > 0) json.gaps = kept;
  return { json, added, replaced, components: components.length, gaps: kept.length };
}
