// Use case: `kitvas kit merge`. Puts the fragments of `<kit>/parts/` into kit.json once every one of
// them is right, then removes the folder (ADR 0081). It never runs `kit verify`; the skill does.

import { isRecord, KitvasError } from '../../shared/index.ts';
import {
  checkFragment,
  type Fragment,
  type FragmentIssue,
  fragmentListing,
  mergeFragments,
  PARTS_DIR,
  repeatedComponentNames,
} from '../domain/fragments.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter } from '../ports/kit-writer.ts';

export type MergeDeps = {
  /** Both layers: a built-in kit is refused, it is not the project's to change. */
  kits: KitStore;
  /** Lists and reads `parts/`, writes kit.json and removes the folder. */
  kitWriter: KitWriter;
};

/** The fragments went into kit.json; `components` and `gaps` count what it holds now. */
export type MergeDone = {
  id: string;
  merged: true;
  added: string[];
  replaced: string[];
  components: number;
  gaps: number;
  issues: FragmentIssue[];
};

/** There were no fragments; `components` counts what kit.json holds. */
export type MergeEmpty = {
  id: string;
  merged: false;
  components: number;
  issues: FragmentIssue[];
};

/** A fragment, or the folder, has problems: nothing was written. */
export type MergeRefused = { id: string; merged: false; issues: FragmentIssue[] };

export type MergeResult = MergeDone | MergeEmpty | MergeRefused;

/** kit.json as an object whose `components` and `gaps`, when there, are lists. */
function kitObject(raw: unknown, id: string): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new KitvasError('KIT_INVALID', { id, detail: 'kit.json: not an object' });
  }
  for (const key of ['components', 'gaps']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) {
      throw new KitvasError('KIT_INVALID', { id, detail: `${key}: not a list` });
    }
  }
  return raw;
}

/**
 * Checks every fragment of the kit's `parts/` before it writes anything; when all are right, writes
 * kit.json whole and removes `parts/`. A kit that is not there throws `KIT_NOT_FOUND`, a built-in
 * kit `KIT_SOURCE_INVALID`, a kit.json that is not JSON or whose lists are not lists `KIT_INVALID`.
 * The kit.json itself is not held to the contract here: it may still lack components.
 */
export function mergeKit(deps: MergeDeps, id: string): MergeResult {
  const files = deps.kits.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
  if (files.project === undefined) {
    throw new KitvasError('KIT_SOURCE_INVALID', {
      detail: `kit "${id}" is built in; kit merge changes the kits of the project`,
    });
  }
  const kitJson = kitObject(files.kitJson, id);
  const listing = deps.kitWriter.listFolder?.(id, PARTS_DIR);
  if (listing === undefined || listing.files.length + listing.other.length === 0) {
    const components = Array.isArray(kitJson.components) ? kitJson.components.length : 0;
    return { id, merged: false, components, issues: [] };
  }

  const read = fragmentListing(listing);
  const issues = [...read.issues];
  const fragments: Fragment[] = [];
  for (const name of read.names) {
    const text = deps.kitWriter.readText(id, `${PARTS_DIR}/${name}.json`) ?? '';
    const checked = checkFragment(name, text);
    if (checked.ok) fragments.push(checked.fragment);
    else issues.push(...checked.issues);
  }
  issues.push(...repeatedComponentNames(fragments));
  if (issues.length > 0) return { id, merged: false, issues };

  const merged = mergeFragments(kitJson, fragments);
  deps.kitWriter.writeText(id, 'kit.json', `${JSON.stringify(merged.json, null, 2)}\n`);
  deps.kitWriter.remove(id, PARTS_DIR);
  return {
    id,
    merged: true,
    added: merged.added,
    replaced: merged.replaced,
    components: merged.components,
    gaps: merged.gaps,
    issues: [],
  };
}
