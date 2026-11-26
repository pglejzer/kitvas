// The Source strip at the bottom of Properties (plan 18f, task 2; spec S4.6 item 7): it stays in
// view under the rows. The file and line of the element's opening tag, that tag as one line of
// code, and the file and line of its class rule. Read only; a click on a place copies its
// `path:line`, and for a moment the place says so. The lines are `source-line.ts`'s.

import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import { text } from '../../texts.ts';
import { el } from '../controls/controls.ts';
import { type Place, sourceLines } from './source-line.ts';

/** How long a place shows that it copied. */
const DONE_MS = 1400;

/** A place's words: `Pricing.tsx · line 21`, or the file alone. */
function placeWords(place: Place): string {
  if (place.line === null) return place.name;
  return text('props.source.at', { file: place.name, line: place.line });
}

function copyButton(place: Place, control: string, status: HTMLElement): HTMLButtonElement {
  const button = el('button', 'props-source-copy', placeWords(place));
  button.type = 'button';
  button.dataset.control = control;
  button.title = text('props.source.copy', { place: place.copy });
  button.addEventListener('click', () => {
    // Refused (no permission, an insecure page): the place is still there to read.
    void navigator.clipboard?.writeText(place.copy).then(
      () => {
        button.dataset.done = '';
        status.textContent = text('props.source.copied', { place: place.copy });
        setTimeout(() => {
          delete button.dataset.done;
          status.textContent = '';
        }, DONE_MS);
      },
      () => undefined,
    );
  });
  return button;
}

/** The strip of one element. */
export function sourceStrip(view: Inspect): HTMLElement {
  const lines = sourceLines(view);
  const strip = el('div', 'props-source');
  strip.dataset.row = 'source';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', text('props.source.title'));
  const status = el('span', 'k-sr');
  status.setAttribute('role', 'status');
  const head = el('div', 'props-source-head');
  head.append(
    el('span', 'props-source-title', text('props.source.title')),
    copyButton(lines.file, 'copy-file', status),
  );
  strip.append(head);
  if (lines.tag !== null) {
    const tag = el('code', 'k-clip props-source-tag', lines.tag);
    tag.title = lines.tag;
    strip.append(tag);
  }
  if (lines.rule !== null) {
    const rule = el('div', 'props-source-rule');
    rule.append(copyButton(lines.rule, 'copy-rule', status));
    if (lines.rule.className !== null) {
      rule.append(el('code', 'k-clip props-source-class', `.${lines.rule.className}`));
    }
    strip.append(rule);
  }
  strip.append(status);
  return strip;
}
