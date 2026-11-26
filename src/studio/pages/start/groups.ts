// The drafts a kit: under the "Drafts" head each kit has a group with its name, its version and how
// many drafts it holds, then its cards. A kit that cannot be read is named by its id with a quiet
// note; the drafts that cannot be read, which name no kit, stand in the last group. The markup
// (`data-group`, `data-group-count`, `data-search`) is the contract with
// `client/studio/start/search.ts`: change both together.

import { type KitStore, loadKit } from '../../../kit/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import { groupByKit } from '../../views/start.ts';
import { type Html, html } from '../html.ts';
import { foldedGrid } from './fold.ts';

/** What a group needs of a card, besides what it shows. */
export type GroupedCard = {
  /** The kit the draft was made with; `null` for a draft that cannot be read. */
  kitId: string | null;
  /** The kit's version the draft names. */
  kitVersion: string | null;
  changed: Date | null;
};

export type GroupsInput<T extends GroupedCard> = {
  t: Translate;
  kits: KitStore;
  /** The id of the kit the project uses; its group comes first. */
  projectKit: string;
  items: readonly T[];
  /** One card, as its `li`. */
  card(item: T): Html;
  /** Only the "All" view folds each group to two rows (`fold.ts`). */
  fold: boolean;
};

/** The kit in the project, as far as the page needs it; `null` when it is not there or not valid. */
export function readKit(kits: KitStore, id: string): { name: string; version: string } | null {
  try {
    const { kit } = loadKit(kits, id);
    return { name: kit.name, version: kit.version };
  } catch (error) {
    if (error instanceof KitvasError) return null;
    throw error;
  }
}

/** The words a search looks in: the kit's name and id are in it besides the card's own. */
export function kitWords(kits: KitStore, id: string | null): string {
  if (id === null) return '';
  const kit = readKit(kits, id);
  return kit === null ? id : `${kit.name} ${id}`;
}

export function kitGroups<T extends GroupedCard>(input: GroupsInput<T>): Html {
  const { t, kits } = input;
  const groups = groupByKit(input.items, input.projectKit).map((group, index) => {
    const known = group.id === null ? null : readKit(kits, group.id);
    const name = group.id === null ? t('studio.gallery.group.unknown') : (known?.name ?? group.id);
    const version = known?.version ?? group.items[0]?.kitVersion ?? null;
    const label =
      version === null || group.id === null
        ? ''
        : html`<span class="gallery-group-version k-meta">${t('studio.gallery.group.version', { version })}</span>`;
    const gone =
      group.id === null || known !== null
        ? ''
        : html`<span class="gallery-group-note k-meta">${t('studio.gallery.group.gone')}</span>`;
    const cards = group.items.map((item) => input.card(item));
    const grid = input.fold
      ? foldedGrid(t, cards)
      : html`<ul class="gallery-grid" role="list">${cards}</ul>`;
    const id = `gallery-group-${index}`;
    return html`<section class="gallery-group" data-group aria-labelledby="${id}"><header class="gallery-group-head"><h3 id="${id}">${name}</h3>${label}<span class="k-count" data-group-count>${group.items.length}</span>${gone}</header>${grid}</section>`;
  });
  return html`<div class="gallery-groups">${groups}</div>`;
}
