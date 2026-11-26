// "Ask Claude" on a finding of the full check (plan 18f, task 4): a `say` request about the finding's
// element, with the words Claude needs. The words are for Claude, in English, so they are constants
// here and not page texts (as `../history/ask.ts` and `../live/fix.ts` keep theirs). Pure.

import type { NewRequest } from '../../../../src/studio/api/requests/request-schemas.ts';
import { MAX_REQUEST_ELEMENTS, MAX_REQUEST_TEXT } from '../ai/requests.ts';
import type { FindingFacts } from './evidence.ts';

/** The words fitted to what is left of the request's room: cut with an ellipsis, never dropped. */
function fitted(words: string, room: number): string {
  if (words.length <= room) return words;
  return room <= 1 ? '' : `${words.slice(0, room - 1)}…`;
}

/**
 * The request: its element, and a sentence with the finding's message, the check's hint and the
 * rule, kept within `MAX_REQUEST_TEXT` (the hint is what gives way first).
 */
export function askRequest(finding: FindingFacts): NewRequest {
  const where = finding.element === null ? '' : ` (element ${finding.element})`;
  const head = `Please fix this finding of the full check in the draft source${where}: `;
  const tail = ` Rule: ${finding.rule}.`;
  const message = finding.message.trim();
  const hint = finding.hint.replace(/\s+/g, ' ').trim();
  const room = Math.max(0, MAX_REQUEST_TEXT - head.length - tail.length);
  const body = fitted(message, room);
  const rest = room - body.length - 1;
  const note = hint === '' || body !== message || rest < 20 ? '' : ` ${fitted(hint, rest)}`;
  return {
    kind: 'say',
    elements: finding.element === null ? [] : [finding.element].slice(0, MAX_REQUEST_ELEMENTS),
    context: { width: null, state: null, option: null },
    text: `${head}${body}${note}${tail}`.slice(0, MAX_REQUEST_TEXT).trim(),
  };
}
