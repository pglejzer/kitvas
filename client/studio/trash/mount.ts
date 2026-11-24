// Delete a draft, with a way back (ADR 0064), on the three pages that need it: the gallery (a
// control on each card, the Deleted list), a draft's own page (Delete draft… in its More menu) and
// the page of a draft that is in the trash. The buttons are found by data attributes on the page
// itself, so a menu the page swaps out keeps working; the page markup is the contract
// (`src/studio/pages/trash/`).

import { onStudioEvent } from '../live/live.ts';
import { type Context, deleteFlow, offerUndo, purgeFlow, restoreFlow } from './actions.ts';
import { createOwn, draftsEventOf, needsLook, type Where } from './events.ts';
import { leftOf, takePending } from './pending.ts';
import { localizeTimes } from './time.ts';

/** Where the script runs, read from the page: the page names a draft, or says it is deleted. */
export function whereOf(root: Document = document): Where {
  const gone = root.querySelector<HTMLElement>('[data-trash-gone]');
  if (gone?.dataset.slug) return { kind: 'gone', slug: gone.dataset.slug };
  const main = root.querySelector<HTMLElement>('main.draft-page');
  if (main?.dataset.draft) return { kind: 'draft', slug: main.dataset.draft };
  return { kind: 'gallery' };
}

const CONTROLS = '[data-trash-delete], [data-trash-restore], [data-trash-forever]';

export function mountTrash(): void {
  const ctx: Context = { where: whereOf(), own: createOwn() };
  localizeTimes(document);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest<HTMLElement>(CONTROLS);
    const holder = control?.closest<HTMLElement>('[data-slug]');
    const slug = holder?.dataset.slug;
    if (!control || !slug) return;
    const title = holder?.dataset.title ?? slug;
    if ('trashDelete' in control.dataset) void deleteFlow(ctx, slug, title);
    else if ('trashRestore' in control.dataset) void restoreFlow(ctx, slug, title);
    else if ('trashForever' in control.dataset) void purgeFlow(ctx, slug, title);
  });

  // A change made somewhere else (another tab, the CLI): the page looks again at what changed.
  onStudioEvent((event) => {
    const change = draftsEventOf(event);
    if (!change || ctx.own.take(change)) return;
    if (needsLook(change, ctx.where)) location.reload();
  });

  // A delete made on a draft's page: the gallery offers Undo for what is left of its 8 seconds.
  if (ctx.where.kind === 'gallery') {
    const now = Date.now();
    const pending = takePending(now);
    if (pending) offerUndo(ctx, pending.slug, pending.title, leftOf(pending, now));
  }
}
