// The cards of the Checks pane (plan 18f, task 4; spec S4.8). The server draws each finding of the
// full check as a card with its words (`src/studio/pages/draft/notes.ts`): the number the canvas
// marks, the title, "<element> in <section>", the details and an empty evidence slot and actions
// slot. This fills them: the evidence row (`evidence.ts`), the short title when the evidence says
// the rest, and the actions (`actions.ts`, `action-plan.ts`): two small buttons at most in the foot,
// Ask Claude as an icon in the head beside a fix; the Dismiss icon and its row are the dismissal's
// (`../live/dismiss.ts`). Run again and Run the full check ask
// for the full check the way Save version does. A swapped pane is decorated again; the store
// redraws the cards when the kit, the mode or a running edit changes what they offer.

import type { EditorContext } from '../context.ts';
import { requestFullCheck } from '../live/check.ts';
import { el } from '../props/controls/controls.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { actionsOf } from './actions.ts';
import { evidenceOf, type FindingFacts, titleKey } from './evidence.ts';
import { evidenceRow } from './evidence-view.ts';

const REGION = '[data-shell="checks"]';
/** The span of a card's own buttons, in front of the waiver's. */
const OWN = 'checks-card-actions';

/** What a card changes with: the kit, the mode, a running edit, the files, the lock, the version. */
const touches = (state: EditorState, previous: EditorState): boolean =>
  state.on !== previous.on ||
  state.edit !== previous.edit ||
  state.busy !== previous.busy ||
  state.etags !== previous.etags ||
  state.locked !== previous.locked ||
  state.waivers !== previous.waivers ||
  state.viewing !== previous.viewing;

/** What the server wrote on the card about its finding. */
function factsOf(row: HTMLElement): FindingFacts | null {
  const { rule, message, hint } = row.dataset;
  if (rule === undefined || message === undefined) return null;
  return {
    rule,
    message,
    hint: hint ?? '',
    element: row.dataset.element ?? row.dataset.waivedElement ?? null,
  };
}

function drawRow(ctx: EditorContext, row: HTMLElement): void {
  const facts = factsOf(row);
  if (facts === null) return;
  const tokens = ctx.store.get().edit?.tokens ?? [];
  const evidence = evidenceOf(facts, tokens);
  const slot = row.querySelector('[data-checks-evidence]');
  const shown = evidenceRow(evidence);
  if (slot) slot.replaceChildren(...(shown ? [shown] : []));
  // A short title when the evidence says the rest; the finding's own words stay in its tooltip.
  const title = row.querySelector<HTMLElement>('.checks-finding-title');
  const key = titleKey(evidence);
  if (title) {
    title.textContent = key === null ? facts.message : text(key);
    if (key === null) title.removeAttribute('title');
    else title.title = facts.message;
  }
  const place = row.querySelector('[data-checks-actions]');
  if (!place) return;
  let own = place.querySelector<HTMLElement>(`:scope > .${OWN}`);
  if (!own) {
    own = el('span', OWN);
    place.prepend(own);
  }
  const { foot, tools } = actionsOf(ctx, facts, () => drawRow(ctx, row));
  own.replaceChildren(...foot);
  // Ask Claude beside a fix is an icon in the head, in front of Dismiss.
  const head = row.querySelector('[data-checks-tools]');
  head?.querySelector('[data-checks-ask]')?.remove();
  head?.prepend(...tools);
}

export function mountCheckCards(ctx: EditorContext): void {
  const { main, store } = ctx;
  const region = main.querySelector<HTMLElement>(REGION);
  if (!region) return;
  const draw = (): void => {
    for (const row of region.querySelectorAll<HTMLElement>('li.note')) {
      // A finding the person dismissed offers nothing but its Restore.
      if (row.hasAttribute('data-waived')) {
        row.querySelector(`.${OWN}`)?.remove();
        row.querySelector('[data-checks-ask]')?.remove();
      } else drawRow(ctx, row);
    }
  };
  region.addEventListener('click', (event) => {
    const from = event.target;
    const target = from instanceof Element ? from.closest('[data-checks-run]') : null;
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;
    if (region.dataset.checksRun === 'running') return;
    requestFullCheck(main);
  });
  // The pane is swapped as a whole when the state changes or a full check ends.
  new MutationObserver(draw).observe(region, { childList: true });
  store.subscribe((state, previous) => {
    if (touches(state, previous)) draw();
  });
  draw();
}
