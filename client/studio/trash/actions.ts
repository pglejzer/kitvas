// What a press on Delete, Restore or Delete forever does (ADR 0064): the confirm, the call, and
// then what the page shows: the card leaves and a message offers Undo, or the page goes to the
// gallery, or the list takes the studio's own version of itself.

import {
  type Answer,
  deleteDraft,
  type Failure,
  failureOf,
  purgeDraft,
  restoreDraft,
} from './api.ts';
import { confirmDialog } from './confirm.ts';
import type { DraftsChange, Own, Where } from './events.ts';
import { swapGallery } from './gallery-swap.ts';
import { showMessage } from './message.ts';
import { savePending, UNDO_MS } from './pending.ts';
import { text } from './texts.ts';

export type Context = { where: Where; own: Own };

/** How long a note that only says something stays. */
const NOTE_MS = 5000;

type Kind = 'delete' | 'restore' | 'forever';

const cardsLeft = (): number => document.querySelectorAll('.gallery-card').length;

/** The focus goes to the page's heading when what held it is gone. */
function focusHeading(): void {
  const heading = document.querySelector<HTMLElement>('.gallery-head h2');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

/**
 * Takes the draft's card or row off the page. A row of the Deleted list names its draft itself; a
 * gallery card does not, and its delete control does.
 */
function removeFrom(selector: string, slug: string): void {
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    const named = node.dataset.slug ?? node.querySelector<HTMLElement>('[data-slug]')?.dataset.slug;
    if (named === slug) node.remove();
  }
}

/** What a failed call says: the files held by another program, a name taken, or just that it failed. */
function failureText(kind: Kind, failure: Failure, title: string): string {
  if (failure === 'locked') return text('delete.locked', { title });
  if (kind === 'restore') {
    return text(failure === 'exists' ? 'restore.exists' : 'restore.failed', { title });
  }
  return text(`${kind}.failed`, { title });
}

/**
 * Makes one change. It is marked as this page's own first, so its event is no news to the page;
 * the mark is dropped when the call fails, because no event will come. A failure is told as a note.
 */
async function make(
  ctx: Context,
  made: DraftsChange,
  kind: Kind,
  title: string,
  call: () => Promise<Answer>,
): Promise<boolean> {
  ctx.own.mark(made);
  const answer = await call();
  if (answer.ok) return true;
  ctx.own.drop(made);
  showMessage({ text: failureText(kind, failureOf(answer), title), ms: NOTE_MS });
  return false;
}

/** Brings the newest deleted copy back: from Undo, from the Deleted list, or from a deleted draft's page. */
export async function restoreFlow(ctx: Context, slug: string, title: string): Promise<void> {
  const call = (): Promise<Answer> => restoreDraft(slug);
  if (!(await make(ctx, { slug, change: 'restored' }, 'restore', title, call))) return;
  if (ctx.where.kind === 'gallery') {
    showMessage({ text: text('undone', { title }), ms: NOTE_MS });
    await swapGallery(true);
    return;
  }
  location.reload();
}

/** Offers Undo for a delete that was just made. */
export function offerUndo(ctx: Context, slug: string, title: string, ms: number): void {
  showMessage({
    text: text('delete.done', { title }),
    undo: { label: text('undo'), run: () => void restoreFlow(ctx, slug, title) },
    ms,
  });
}

export async function deleteFlow(ctx: Context, slug: string, title: string): Promise<void> {
  const sure = await confirmDialog({
    title: text('delete.title', { title }),
    body: text('delete.body', { title, slug }),
    confirm: text('delete.confirm'),
    cancel: text('cancel'),
  });
  if (!sure) return;
  const call = (): Promise<Answer> => deleteDraft(slug);
  if (!(await make(ctx, { slug, change: 'deleted' }, 'delete', title, call))) return;
  if (ctx.where.kind !== 'gallery') {
    // The gallery shows the message with Undo, as the card's own delete does.
    savePending({ slug, title, at: Date.now() });
    location.assign('/');
    return;
  }
  removeFrom('.gallery-card', slug);
  offerUndo(ctx, slug, title, UNDO_MS);
  await swapGallery(cardsLeft() === 0);
  // After the swap: it replaces the heading the focus would have gone to.
  focusHeading();
}

export async function purgeFlow(ctx: Context, slug: string, title: string): Promise<void> {
  const sure = await confirmDialog({
    title: text('forever.title', { title }),
    body: text('forever.body', { title }),
    confirm: text('forever.confirm'),
    cancel: text('cancel'),
  });
  if (!sure) return;
  const call = (): Promise<Answer> => purgeDraft(slug);
  if (!(await make(ctx, { slug, change: 'purged' }, 'forever', title, call))) return;
  removeFrom('.trash-row', slug);
  showMessage({ text: text('forever.done', { title }), ms: NOTE_MS });
  await swapGallery(true);
  focusHeading();
}
