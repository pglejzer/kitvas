// Restore of a lock (spec 4d, goal 4; plan 17, task C): the source a lock keeps put back in the
// place of its element, which another writer changed. The answer has the shape of Bring back's
// (`RestorePreviewSchema`): the kept source beside the current one, what the kept source needs
// that the file lacks now, and the edit. The edit is one `replaceElement` with the kept source:
// the pipeline indents it to where the element stands now, so an element still at the place it
// was locked at gets its text back byte for byte. Nothing is written here; the lock refusal lets
// this one edit through (`lock-rules.ts`).

import type { KitStore, LoadedKit } from '../../../kit/index.ts';
import { type EditOp, hashOf, MAX_SOURCE } from '../../domain/ops.ts';
import { elementSpan } from '../../domain/structure/subtree.ts';
import { reindent, sourceIndent } from '../../domain/tsx/format.ts';
import { editKit } from '../edit-state.ts';
import { replaceNeeds } from '../structure/replace-scope.ts';

/** `RestorePreviewSchema` takes names this long. */
const MAX_NAME = 120;

export type LockRestoreInput = {
  /** The locked element's id in the latest version. */
  id: string;
  /** Its file: `src/tsx/sections/Hero.tsx`. */
  file: string;
  /** The source the lock keeps, as it was cut from the file. */
  kept: string;
  /** The file's text now, and the `<` of the element in it. */
  text: string;
  at: number;
  /** The draft's kit: its components are imported when the kept source uses them. */
  kitId: string;
};

/** The same shape as the studio's `RestorePreviewSchema`. */
export type LockRestore = {
  file: string;
  old: string;
  current: string;
  missing: string[];
  imports: string[];
  ops: EditOp[] | null;
};

/** The kit's component names, with the icon component. */
function kitNames(loaded: LoadedKit | null): ReadonlySet<string> {
  const names = new Set(loaded?.kit.components.map((component) => component.name) ?? []);
  const icons = loaded?.kit.icons;
  if (icons?.source === 'component') names.add(icons.component);
  return names;
}

/** A raw slice of a file with its later lines moved to the margin, as a source of its own. */
const dedent = (raw: string): string => reindent(raw, sourceIndent(raw), '');

/**
 * What putting the kept source back would do; `null` when no element starts at `input.at`. `ops`
 * is `null` while `missing` names anything: the person asks Claude then.
 */
export function lockRestore(kits: KitStore, input: LockRestoreInput): LockRestore | null {
  const span = input.text.charAt(input.at) === '<' ? elementSpan(input.text, input.at) : null;
  if (span === null) return null;
  const raw = input.text.slice(span.start, span.end);
  const old = dedent(input.kept);
  const current = dedent(raw);
  const needs = replaceNeeds(old, kitNames(editKit(kits, input.kitId)), {
    text: input.text,
    at: input.at,
  });
  const missing = (needs?.missing ?? ['one whole element']).map((name) => name.slice(0, MAX_NAME));
  if (old.length > MAX_SOURCE) missing.push(`a source of at most ${MAX_SOURCE} characters`);
  const ops: EditOp[] | null =
    missing.length > 0
      ? null
      : [{ op: 'replaceElement', id: input.id, source: old, hash: hashOf(raw) }];
  return { file: input.file, old, current, missing, imports: needs?.imports ?? [], ops };
}
