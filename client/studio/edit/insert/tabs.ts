// The tab row of the Insert pane (mock v10 `.ptabs`): Components | Sections | Icons | Images, one
// panel shown at a time. Arrow keys move between tabs. Drawing only; `previews.ts` holds the rules.

import { text } from '../texts.ts';
import { arrowTab, TABS, type TabCounts, type TabId } from './previews.ts';

const LABEL: Record<TabId, string> = {
  components: 'palette.components',
  sections: 'palette.sections',
  icons: 'palette.icons',
  images: 'palette.images',
};

export type TabRow = {
  el: HTMLElement;
  /** Marks `tab` as the shown one. */
  show(tab: TabId): void;
  /** A count on each searched tab while the search has text; `null` clears them. */
  setCounts(counts: TabCounts | null): void;
};

export const panelId = (tab: TabId): string => `insert-panel-${tab}`;

export function createTabs(onPick: (tab: TabId) => void): TabRow {
  const el = document.createElement('div');
  el.className = 'insert-tabs';
  el.setAttribute('role', 'tablist');
  el.setAttribute('aria-label', text('palette.title'));
  const buttons = new Map<TabId, HTMLButtonElement>();
  const counts = new Map<TabId, HTMLSpanElement>();
  for (const tab of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `insert-tab-${tab}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId(tab));
    const name = document.createElement('span');
    name.textContent = text(LABEL[tab]);
    const count = document.createElement('span');
    count.className = 'insert-tab-count';
    count.hidden = true;
    button.append(name, count);
    button.addEventListener('click', () => onPick(tab));
    button.addEventListener('keydown', (event) => {
      const next = arrowTab(tab, event.key);
      if (next === null) return;
      event.preventDefault();
      onPick(next);
      buttons.get(next)?.focus();
    });
    buttons.set(tab, button);
    counts.set(tab, count);
    el.append(button);
  }
  return {
    el,
    show(tab) {
      for (const [id, button] of buttons) {
        button.setAttribute('aria-selected', String(id === tab));
        button.tabIndex = id === tab ? 0 : -1;
      }
    },
    setCounts(next) {
      for (const [id, count] of counts) {
        const value = next !== null && id !== 'images' ? next[id] : null;
        count.hidden = value === null;
        count.textContent = value === null ? '' : String(value);
      }
    },
  };
}
