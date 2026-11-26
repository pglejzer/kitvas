// Use case: the record of a draft's hand-offs, `handoff.json` beside `draft.json`. The skill writes
// a result file; `recordSend` checks it with `readSend`, stamps it with the clock of the command and
// keeps it, for a send to Figma (plan 21) and for a send into the project's code (plan 22).

import { type DraftStore, loadDraft, versionFolder } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import {
  emptyRecord,
  HANDOFF_RECORD_FILE,
  type HandoffRecord,
  HandoffRecordSchema,
  readSend,
  withSend,
} from '../domain/record.ts';

export type RecordDeps = {
  drafts: DraftStore;
  now(): Date;
};

/** The brief of a version for a hand-off into code, inside the draft's folder. */
export const codeBriefFile = (version: number): string =>
  `${versionFolder(version)}/handoff/code/brief.json`;

/** The record of a draft; an empty one when it has none yet. */
export function readRecord(drafts: DraftStore, slug: string): HandoffRecord {
  const raw = drafts.readJson(slug, HANDOFF_RECORD_FILE);
  if (raw === undefined) return emptyRecord();
  const parsed = HandoffRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KitvasError('HANDOFF_INVALID', { at: HANDOFF_RECORD_FILE, reason: 'shape' });
  }
  return parsed.data;
}

/**
 * Keeps one send. HANDOFF_INVALID for a result outside the schema, HANDOFF_NO_BRIEF for a code
 * send of a version that has no brief. Nothing is written on a failure.
 */
export function recordSend(deps: RecordDeps, slug: string, raw: unknown): HandoffRecord {
  loadDraft(deps.drafts, slug);
  const read = readSend(raw, deps.now().toISOString());
  if (!read.ok) throw read.error;
  const send = read.value;
  if (send.target === 'code' && !deps.drafts.exists(slug, codeBriefFile(send.version))) {
    throw new KitvasError('HANDOFF_NO_BRIEF', { slug, version: send.version });
  }
  const record = withSend(readRecord(deps.drafts, slug), send);
  deps.drafts.writeText(slug, HANDOFF_RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
