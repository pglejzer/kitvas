// Bringing one element back from an older version (spec 4d, goal 5; plan 17, task D): the old
// source beside the current one, checked against the current file before anything is offered.
// Every name the old source reads must be there now, every kit component it uses is imported or
// will be, and no prop it writes left the kit since. Only then the answer carries the edit: one
// `replaceElement`, which the person accepts as an ordinary edit with undo. Nothing is written
// here.

import { type DraftStore, latestVersion, loadDraft } from '../../../drafts/index.ts';
import type { KitStore, LoadedKit } from '../../../kit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { type EditOp, fileOfId, hashOf, MAX_SOURCE } from '../../domain/ops.ts';
import { reindent, sourceIndent } from '../../domain/tsx/format.ts';
import { openingTags, readTag } from '../../domain/tsx/tsx-reader.ts';
import type { EditCompiler } from '../../ports/compiler.ts';
import { editKit, kitNames } from '../edit-state.ts';
import { replaceNeeds } from '../structure/replace-scope.ts';
import { elementHistory } from './element-history.ts';
import { readVersionFile } from './version-elements.ts';

export type RestoreDeps = { drafts: DraftStore; kits: KitStore; compiler: EditCompiler };

/** The element by its id in the latest version, and the version to take its source from. */
export type RestoreInput = { id: string; version: number };

/** The same shape as the studio's `RestorePreviewSchema`. */
export type RestorePreview = {
  file: string;
  old: string;
  current: string;
  missing: string[];
  imports: string[];
  ops: EditOp[] | null;
};

/** `RestorePreviewSchema` takes names this long. */
const MAX_NAME = 120;
/** Props any component passes on, whatever its catalog lists. */
const PASSED = /^(?:key|ref|style|children|id|role|aria-.+|data-.+|on[A-Z].*)$/;

type Found = { file: string; text: string; raw: string; at: number };

/** A raw slice of a file with its later lines moved to the margin, as a source of its own. */
const dedent = (raw: string): string => reindent(raw, sourceIndent(raw), '');

/** Each `Component prop` pair a source writes on a kit component (never on a part). */
function kitProps(source: string, loaded: LoadedKit | null): Map<string, boolean> {
  const pairs = new Map<string, boolean>();
  for (const at of openingTags(source)) {
    const tag = readTag(source, at);
    if (typeof tag === 'string' || tag.name.includes('.')) continue;
    const component = loaded?.kit.components.find((each) => each.name === tag.name);
    if (component === undefined) continue;
    for (const prop of tag.props) {
      if (PASSED.test(prop.name)) continue;
      const known = component.props.some((each) => each.name === prop.name);
      pairs.set(`${prop.name} (a prop of ${tag.name})`, known);
    }
  }
  return pairs;
}

/**
 * The props the old source writes that the kit's catalog does not list. One the current source
 * writes on the same component is left out: it is no worse after the restore than before it.
 */
function lostProps(old: string, current: string, loaded: LoadedKit | null): string[] {
  const now = kitProps(current, loaded);
  return [...kitProps(old, loaded)]
    .filter(([pair, known]) => !known && !now.has(pair))
    .map(([pair]) => pair.slice(0, MAX_NAME));
}

/**
 * What bringing the element `input.id` back from `input.version` would do. `ops` is `null` while
 * `missing` names anything. Throws VERSION_NOT_FOUND for a version the draft does not have, and
 * EDIT_ELEMENT_NOT_FOUND when the element is not in the latest version or was not in that one.
 */
export async function restorePreview(
  deps: RestoreDeps,
  slug: string,
  input: RestoreInput,
): Promise<RestorePreview> {
  const draft = loadDraft(deps.drafts, slug);
  const latest = latestVersion(draft);
  if (!draft.versions.some((entry) => entry.number === input.version)) {
    throw new KitvasError('VERSION_NOT_FOUND', { slug, version: input.version });
  }
  const gone = (): KitvasError =>
    new KitvasError('EDIT_ELEMENT_NOT_FOUND', { slug, version: input.version, id: input.id });
  const find = async (version: number, id: string): Promise<Found> => {
    const file = fileOfId(id);
    const read = await readVersionFile(deps, slug, version, file);
    const element = read?.elements.find((each) => each.id === id);
    if (read === null || element === undefined) throw gone();
    const raw = read.text.slice(element.span.start, element.span.end);
    return { file, text: read.text, raw, at: element.at };
  };

  const history = await elementHistory(deps, slug, input.id);
  const then = history.steps.find((step) => step.version === input.version);
  if (then === undefined || then.id === null) throw gone();
  const was = await find(input.version, then.id);
  const now = await find(latest, input.id);
  const old = dedent(was.raw);
  const current = dedent(now.raw);

  const loaded = editKit(deps.kits, draft.kit.id);
  const needs = replaceNeeds(old, kitNames(loaded), { text: now.text, at: now.at });
  if (needs === null) throw gone();
  const missing = [
    ...needs.missing.map((name) => name.slice(0, MAX_NAME)),
    ...lostProps(old, current, loaded),
  ];
  // An op carries a source up to `MAX_SOURCE`: a longer element is Claude's to bring back.
  if (old.length > MAX_SOURCE) missing.push(`a source of at most ${MAX_SOURCE} characters`);
  const ops: EditOp[] | null =
    missing.length > 0
      ? null
      : [{ op: 'replaceElement', id: input.id, source: old, hash: hashOf(now.raw) }];
  return { file: now.file, old, current, missing, imports: needs.imports, ops };
}
