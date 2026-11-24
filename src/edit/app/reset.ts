// "Reset to session start" (spec 4b, decision 15; plan 14, task B2): an element's whole source as
// the session found it. A session's version starts as a copy of the version before it, so the id
// the element had then, followed back through the rename log, names it in that version's file.
// Task B3 turns `resetElement` into `replaceElement` with the source found here.

import {
  type Draft,
  type DraftStore,
  editSession,
  idAtStart,
  loadDraft,
  readRenames,
  versionFolder,
} from '../../drafts/index.ts';
import { fileOfId } from '../domain/ops.ts';
import { elementSpan } from '../domain/subtree.ts';
import type { EditCompiler } from '../ports/compiler.ts';
import { locateElement } from './locate.ts';

export type ResetDeps = { drafts: DraftStore; compiler: EditCompiler };
/**
 * `not-in-session`: the element did not exist when the session started (an edit of the session
 * created it, or a file or element came since from another writer); the panel offers "Delete".
 * `not-found`: the start's text holds the id but cannot be read for it (it does not compile).
 */
export type ResetSource = { source: string } | { refused: 'not-in-session' | 'not-found' };

const NOT_IN_SESSION: ResetSource = { refused: 'not-in-session' };
const NOT_FOUND: ResetSource = { refused: 'not-found' };

/** The newest version older than `version`; `null` when it is the first. */
function versionBefore(draft: Draft, version: number): number | null {
  const older = draft.versions.map((entry) => entry.number).filter((number) => number < version);
  return older.length === 0 ? null : Math.max(...older);
}

/**
 * The source of the element `id` (an id of `version`'s current text, as the request names it) at
 * the start of the session in `version`, from its `<` through its closing tag, as written then.
 * Without a session open in `version`, the edit that resets would start one as a copy of
 * `version`: that copy is the start, and no step of a log has happened in it yet.
 */
export async function resolveReset(
  deps: ResetDeps,
  slug: string,
  version: number,
  id: string,
): Promise<ResetSource> {
  const draft = loadDraft(deps.drafts, slug);
  const open = editSession(draft)?.version === version;
  const start = open ? versionBefore(draft, version) : version;
  if (start === null) return NOT_IN_SESSION;
  const startId = open ? idAtStart(readRenames(deps.drafts, slug, version), id) : id;
  if (startId === null) return NOT_IN_SESSION;
  const file = fileOfId(startId);
  const text = deps.drafts.readText(slug, `${versionFolder(start)}/${file}`);
  // The file itself came during the session.
  if (text === undefined) return NOT_IN_SESSION;
  const at = await locateElement(deps.compiler, text, file, startId);
  // No element had the id then: another writer added it since, outside the log.
  if (at === 'not-found') return NOT_IN_SESSION;
  if (typeof at !== 'number') return NOT_FOUND;
  const span = elementSpan(text, at);
  return span === null ? NOT_FOUND : { source: text.slice(span.start, span.end) };
}
