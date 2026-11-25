// The insert pane (spec 4b, R6; plan 14, task D5; redesign plan 18e, task H7b, mock v10): a search
// field, a tab row (Components, Sections, Icons, Images) and one panel at a time: the kit's
// components by category with a preview of each, sections of other drafts, icons as glyphs, and the
// draft's images (`images.ts` fills that panel). A click inserts at the chosen place, a drag goes to
// the frame. The decisions are in `rules.ts` and `previews.ts`; `mountPalette` only draws and wires.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Palette } from '../../../../src/studio/api/edit/structure-schemas.ts';
import { icon } from '../../ui/icon.ts';
import { getPalette } from '../api.ts';
import type { EditorContext } from '../context.ts';
import type { Gesture } from '../store.ts';
import { text } from '../texts.ts';
import { categoryHead, listOf } from './group-view.ts';
import { groupByCategory, groupTitle } from './groups.ts';
import { iconBody } from './icon-grid.ts';
import { createItemDrag } from './item-drag.ts';
import {
  POLL_MS,
  pollDecision,
  previewState,
  readTab,
  shownTab,
  TABS,
  type TabCounts,
  type TabId,
  tabStorage,
  writeTab,
} from './previews.ts';
import {
  codeOf,
  dropOp,
  filterPalette,
  type Item,
  iconCode,
  labelOf,
  opFor,
  type PaletteComponent,
  partName,
  WHERES,
  type Where,
} from './rules.ts';
import { createTabs, panelId } from './tabs.ts';
import { applyPreview, type TileOptions, tileView } from './tile.ts';

export {
  clickTarget,
  codeOf,
  DRAG_THRESHOLD,
  dropOp,
  type Filtered,
  filterPalette,
  type Item,
  iconCode,
  labelOf,
  opFor,
  type PaletteComponent,
  type PaletteSection,
  partFits,
  type Refusal,
  sectionAfter,
  type Target,
  type Where,
} from './rules.ts';

export function mountPalette(ctx: EditorContext): void {
  const { store, bridge, panel, history } = ctx;
  const section = panel.querySelector('section[data-edit="palette"]');
  if (!(section instanceof HTMLElement)) return;

  let palette: Palette | null = null;
  let query = '';
  let loading = false;
  let picked: TabId = readTab(tabStorage());
  const drag = createItemDrag(ctx);
  /** The component tiles by name, so a new preview lands in place. */
  const tiles = new Map<string, HTMLLIElement>();
  let sheetSrc: string | null = null;

  /** Where a click puts the thing; the drag decides for itself at the drop. */
  let where: Where = 'after';

  const head = document.createElement('div');
  head.className = 'k-pad insert-head';
  const title = document.createElement('div');
  title.className = 'k-head';
  const heading = document.createElement('h2');
  heading.textContent = text('palette.title');
  title.append(heading);
  const find = document.createElement('label');
  find.className = 'k-search';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'k-field insert-search';
  search.placeholder = text('palette.search');
  search.setAttribute('aria-label', text('palette.search'));
  find.append(icon('search'), search);
  head.append(title, find);

  const tabRow = createTabs((tab) => {
    picked = tab;
    writeTab(tabStorage(), tab);
    showTab();
  });
  const scroll = document.createElement('div');
  scroll.className = 'k-scroll insert-scroll';
  scroll.dataset.insertScroll = '';
  const panels = new Map<TabId, HTMLElement>();
  for (const tab of TABS) {
    const one = document.createElement('div');
    one.className = 'insert-panel k-rise';
    one.id = panelId(tab);
    one.dataset.insertPanel = tab;
    one.setAttribute('role', 'tabpanel');
    one.setAttribute('aria-labelledby', `insert-tab-${tab}`);
    panels.set(tab, one);
    scroll.append(one);
  }
  const note = document.createElement('p');
  note.className = 'insert-note k-meta';
  note.setAttribute('role', 'status');
  note.hidden = true;
  const foot = document.createElement('div');
  foot.className = 'insert-where k-rise';
  const wherePick = document.createElement('div');
  wherePick.className = 'k-seg';
  wherePick.setAttribute('role', 'group');
  wherePick.setAttribute('aria-label', text('palette.where'));
  for (const choice of WHERES) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.dataset.where = choice;
    pick.textContent = text(`palette.where.${choice}`);
    pick.setAttribute('aria-pressed', String(choice === where));
    pick.addEventListener('click', () => {
      where = choice;
      for (const one of wherePick.querySelectorAll('button')) {
        one.setAttribute('aria-pressed', String(one.dataset.where === where));
      }
    });
    wherePick.append(pick);
  }
  /** The element an insert goes next to: nothing selected, nothing shown. */
  const next = document.createElement('span');
  next.className = 'k-chip insert-next k-clip';
  next.hidden = true;
  foot.append(wherePick, next);
  section.append(head, tabRow.el, scroll, note, foot);

  function showNext(): void {
    const state = store.get();
    const first = state.selection[0];
    const entry =
      first === undefined ? undefined : state.structure?.elements.find((e) => e.id === first);
    const name = entry ? (entry.component ?? entry.tag) : '';
    next.hidden = name === '';
    next.textContent = name;
  }

  const say = (message: string | null): void => {
    note.hidden = message === null;
    note.textContent = message ?? '';
  };

  function insert(op: EditOp, name: string): void {
    if (store.get().busy) return;
    // `selectCreated` is read by the history when it has it (task D1); the type may not name it yet.
    const gesture: Gesture & { selectCreated?: boolean } = {
      ops: [op],
      label: text('palette.insert', { name }),
      selectCreated: true,
    };
    void history.apply(gesture);
  }

  function click(item: Item): void {
    if (drag.takeSuppressed()) return;
    const state = store.get();
    if (!state.structure) return;
    const op = opFor(item, state.structure, null, state.selection, where);
    if (op === 'needsProps' && item.kind === 'component') {
      say(text('palette.needsProps', { props: item.component.required.join(', ') }));
    } else if (op === 'partOnly') {
      say(text('palette.partOnly', { parent: partName(item) }));
    } else if (typeof op === 'string') {
      say(text('palette.noTarget'));
    } else {
      say(null);
      insert(op, labelOf(item));
    }
  }

  function wire(button: HTMLButtonElement, item: Item, disabled = false): void {
    button.addEventListener('click', () => click(item));
    if (!disabled) drag.wire(button, item);
  }

  function row(item: Item, label: string, options: TileOptions): HTMLLIElement {
    const { li, button } = tileView(label, options);
    wire(button, item, options.disabled);
    return li;
  }

  function componentRow(component: PaletteComponent): HTMLLIElement {
    const needs = codeOf(component) === null;
    const li = row({ kind: 'component', component }, component.name, {
      hint: needs ? text('palette.needsProps', { props: component.required.join(', ') }) : null,
      disabled: needs,
      part: component.parent !== null,
      preview: previewState(palette?.previews, component.name),
    });
    tiles.set(component.name, li);
    return li;
  }

  /** The kit page's colour behind previews and glyphs; none leaves the studio's own surface. */
  function setBackdrop(): void {
    if (!(section instanceof HTMLElement)) return;
    const backdrop = palette?.previews?.backdrop ?? null;
    if (backdrop === null || backdrop === '') section.style.removeProperty('--insert-backdrop');
    else section.style.setProperty('--insert-backdrop', backdrop);
  }

  function iconsBody(names: readonly string[], iconComponent: string): HTMLElement {
    return iconBody(names, palette?.previews?.icons ?? null, (name, button) => {
      button.dataset.icon = name;
      wire(button, { kind: 'icon', component: iconComponent, name });
    });
  }

  const empty = (): HTMLElement => {
    const one = document.createElement('p');
    one.className = 'k-empty insert-empty';
    one.textContent = text('palette.none');
    return one;
  };

  function counts(): TabCounts {
    if (!palette) return { components: 0, sections: 0, icons: 0 };
    const shown = filterPalette(palette, query);
    const iconComponent = palette.icons?.component ?? '';
    return {
      components: shown.components.length,
      sections: shown.sections.length,
      icons: shown.icons.filter((name) => iconCode(iconComponent, name) !== null).length,
    };
  }

  /** Shows the panel of `shownTab`; while the search has text the tab row carries the counts. */
  function showTab(): void {
    const searching = query.trim() !== '';
    const all = counts();
    const tab = shownTab(picked, all, searching);
    tabRow.show(tab);
    tabRow.setCounts(searching ? all : null);
    for (const [id, one] of panels) one.hidden = id !== tab;
  }

  function render(): void {
    tiles.clear();
    if (!palette) return;
    setBackdrop();
    sheetSrc = palette.previews?.icons?.src ?? null;
    const shown = filterPalette(palette, query);
    const components = panels.get('components');
    const sections = panels.get('sections');
    const icons = panels.get('icons');
    if (!components || !sections || !icons) return;
    // The kit's components by category, in the order the kit lists them.
    components.replaceChildren();
    for (const group of groupByCategory(shown.components, text('palette.components'))) {
      components.append(categoryHead(groupTitle(group.category)));
      components.append(listOf('insert-tiles', group.items.map(componentRow)));
    }
    if (shown.components.length === 0) components.append(empty());
    sections.replaceChildren(
      shown.sections.length === 0
        ? empty()
        : listOf(
            'insert-rows',
            shown.sections.map((entry) =>
              row(
                {
                  kind: 'section',
                  slug: entry.slug,
                  section: entry.section,
                  purpose: entry.purpose,
                },
                entry.section,
                {
                  hint: `${entry.purpose} (${text('palette.from', { slug: entry.slug })})`,
                  disabled: false,
                  part: false,
                  detail: entry.purpose,
                },
              ),
            ),
          ),
    );
    drawIcons(icons, shown.icons);
    showTab();
  }

  function drawIcons(host: HTMLElement, names: readonly string[]): void {
    const iconComponent = palette?.icons?.component ?? '';
    const usable = names.filter((name) => iconCode(iconComponent, name) !== null);
    host.replaceChildren(usable.length === 0 ? empty() : iconsBody(usable, iconComponent));
  }

  /** New previews land in the tiles that are drawn: scroll and focus stay where they are. */
  function upgrade(): void {
    if (!palette) return;
    setBackdrop();
    for (const [name, li] of tiles) applyPreview(li, previewState(palette.previews, name));
    const nextSheet = palette.previews?.icons?.src ?? null;
    const host = panels.get('icons');
    if (nextSheet === sheetSrc || !host) return;
    sheetSrc = nextSheet;
    const focused = document.activeElement;
    const keep =
      focused instanceof HTMLElement && host.contains(focused)
        ? (focused.dataset.icon ?? null)
        : null;
    drawIcons(host, filterPalette(palette, query).icons);
    if (keep === null) return;
    for (const button of host.querySelectorAll<HTMLElement>('button')) {
      if (button.dataset.icon === keep) button.focus({ preventScroll: true });
    }
  }

  /** While previews are being made, ask again every `POLL_MS`, at most `POLL_MAX` times. */
  function poll(asked: number): void {
    if (pollDecision(palette?.previews?.state, asked) === 'stop') return;
    setTimeout(() => {
      void getPalette(ctx.slug).then((answer) => {
        if (answer.ok) {
          palette = answer.body;
          upgrade();
        }
        poll(asked + 1);
      });
    }, POLL_MS);
  }

  async function load(): Promise<void> {
    if (palette || loading) return;
    loading = true;
    const answer = await getPalette(ctx.slug);
    loading = false;
    if (answer.ok) {
      palette = answer.body;
      render();
      poll(0);
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  bridge.on((message) => {
    const item = drag.current();
    if (message.type !== 'drop' || message.source.kind !== 'insert' || item === null) return;
    if (message.source.label !== labelOf(item)) return;
    drag.clear();
    const state = store.get();
    if (!state.structure) return;
    const slot = { anchor: message.anchor, place: message.place };
    const op = dropOp(item, state.structure, slot, state.selection);
    if (op === null) {
      say(text('palette.partOnly', { parent: partName(item) }));
      return;
    }
    say(null);
    insert(op, labelOf(item));
  });

  store.subscribe((state, previous) => {
    if (state.on && !previous.on) void load();
    if (state.selection !== previous.selection || state.structure !== previous.structure)
      showNext();
  });
  showTab();
  showNext();
  if (store.get().on) void load();
}
