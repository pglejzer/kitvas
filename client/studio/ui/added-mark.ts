// The mark of what a project added to its kit (plan 25, C8): the same markup as `addedMark` of
// `src/studio/pages/added-mark.ts`, for the controls the page's scripts draw. `note` is the text
// "Added by this project. Not part of {source}." (`props.added` of the editor's texts); it is the
// mark's accessible name and its tooltip.

import { icon } from './icon.ts';

export function addedMark(note: string): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = 'k-added';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', note);
  mark.title = note;
  mark.append(icon('plus'));
  return mark;
}
