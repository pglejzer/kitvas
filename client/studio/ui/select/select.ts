// The studio select: a trigger that looks like a field and a floating list with groups, a search
// from SEARCH_FROM items, swatches, warnings, a footer option and a hover preview (`onActive`).
// It holds no text of its own: every word comes in through the options. The list lives in the
// body so no panel clips it; the trigger carries `data-open-list` while it is open.

import { icon } from '../icon.ts';
import type { MoveKey, SelectItem } from './model.ts';
import { filterItems, groupItems, moveActive, SEARCH_FROM } from './model.ts';
import { placeList } from './place.ts';

export type { SelectItem } from './model.ts';

export type StudioSelectOptions = {
  label: string;
  items: readonly SelectItem[];
  value: string | null;
  placeholder: string;
  control?: string;
  disabled?: boolean;
  footer?: { value: string; name: string } | null;
  search: { label: string; none: string };
  stepKeys?: boolean;
  onPick(value: string): void;
  onActive?(value: string | null): void;
  onClose?(): void;
};

export type StudioSelect = {
  root: HTMLElement;
  trigger: HTMLButtonElement;
  show(value: string | null): void;
  open(): void;
  close(): void;
};

const MOVE_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
let counter = 0;

function isMoveKey(key: string): key is MoveKey {
  return MOVE_KEYS.includes(key);
}

function part(className: string, text?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  if (text !== undefined) span.textContent = text;
  return span;
}

function swatchOf(color: string): HTMLSpanElement {
  const span = part('k-swatch');
  span.style.backgroundColor = color;
  return span;
}

export function studioSelect(options: StudioSelectOptions): StudioSelect {
  const uid = `k-select-${++counter}`;
  const listId = `${uid}-list`;
  const items = options.items;
  const footerItem: SelectItem | null = options.footer
    ? { ...options.footer, group: null, detail: null, swatch: null, warn: null }
    : null;
  const searchable = items.length >= SEARCH_FROM;
  let current = options.value;

  const root = document.createElement('span');
  root.className = 'k-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'k-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listId);
  trigger.setAttribute('aria-label', options.label);
  trigger.dataset.control = options.control ?? 'main';
  trigger.disabled = options.disabled === true;
  root.append(trigger);

  let list: HTMLDivElement | null = null;
  let optionsBox: HTMLDivElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  let shown: SelectItem[] = [];
  let active: number | null = null;
  let query = '';

  function drawTrigger(): void {
    const item = items.find((entry) => entry.value === current) ?? null;
    const parts: Node[] = [];
    if (item?.swatch) parts.push(swatchOf(item.swatch));
    const name = part('k-select-name', item ? item.name : options.placeholder);
    if (!item) name.dataset.placeholder = '';
    parts.push(name);
    if (item?.detail) parts.push(part('k-select-detail', item.detail));
    parts.push(icon('chevron-down'));
    trigger.replaceChildren(...parts);
  }

  function optionId(index: number): string {
    return `${uid}-o${index}`;
  }

  function setActive(next: number | null, notify: boolean): void {
    if (!list) return;
    active = next;
    for (const node of list.querySelectorAll('[data-active]')) node.removeAttribute('data-active');
    const focusHolder = searchInput ?? list;
    const node = next === null ? null : list.querySelector<HTMLElement>(`#${optionId(next)}`);
    if (node) {
      node.setAttribute('data-active', '');
      focusHolder.setAttribute('aria-activedescendant', node.id);
      node.scrollIntoView({ block: 'nearest' });
    } else focusHolder.removeAttribute('aria-activedescendant');
    if (notify) options.onActive?.(next === null ? null : (shown[next]?.value ?? null));
  }

  function optionNode(item: SelectItem, index: number): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'k-select-option';
    node.id = optionId(index);
    node.setAttribute('role', 'option');
    const isCurrent = item.value === current;
    node.setAttribute('aria-selected', String(isCurrent));
    if (item.swatch) node.append(swatchOf(item.swatch));
    node.append(part('k-select-name', item.name));
    if (item.warn) {
      const warn = part('k-select-warn');
      warn.title = item.warn;
      warn.setAttribute('aria-description', item.warn);
      warn.append(icon('alert'));
      node.append(warn);
    }
    if (item.detail) node.append(part('k-select-detail', item.detail));
    if (isCurrent) node.append(icon('check'));
    node.addEventListener('pointermove', () => {
      if (active !== index) setActive(index, true);
    });
    node.addEventListener('click', () => pick(item.value));
    return node;
  }

  function drawOptions(): void {
    if (!optionsBox) return;
    const groups = groupItems(filterItems(items, query));
    shown = groups.flatMap((entry) => entry.items);
    const nodes: Node[] = [];
    let index = 0;
    for (const entry of groups) {
      if (entry.group !== null) {
        const head = document.createElement('div');
        head.className = 'k-select-group';
        head.setAttribute('role', 'presentation');
        head.textContent = entry.group;
        nodes.push(head);
      }
      for (const item of entry.items) nodes.push(optionNode(item, index++));
    }
    if (shown.length === 0) {
      const none = document.createElement('p');
      none.className = 'k-select-none';
      none.textContent = options.search.none;
      nodes.push(none);
    }
    if (footerItem) {
      const sep = document.createElement('div');
      sep.className = 'k-select-sep';
      sep.setAttribute('role', 'separator');
      nodes.push(sep, optionNode(footerItem, index));
      shown.push(footerItem);
    }
    optionsBox.replaceChildren(...nodes);
  }

  function place(): void {
    if (!list) return;
    const rect = trigger.getBoundingClientRect();
    const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const view = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const placed = placeList(box, view, list.scrollHeight);
    list.style.left = `${placed.left}px`;
    list.style.top = `${placed.top}px`;
    list.style.width = `${placed.width}px`;
    list.style.maxHeight = `${placed.maxHeight}px`;
  }

  function onScroll(event: Event): void {
    if (list && event.target instanceof Node && list.contains(event.target)) return;
    place();
  }

  function onOutside(event: Event): void {
    const target = event.target;
    if (target instanceof Node && (trigger.contains(target) || list?.contains(target))) return;
    shut(false, true);
  }

  function onBlur(): void {
    shut(false, true);
  }

  function pick(value: string): void {
    current = value;
    drawTrigger();
    shut(true, false);
    trigger.focus();
    options.onPick(value);
  }

  function shut(picked: boolean, clearPreview: boolean): void {
    if (!list) return;
    const gone = list;
    list = null;
    optionsBox = null;
    searchInput = null;
    active = null;
    query = '';
    gone.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('blur', onBlur);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('data-open-list');
    if (clearPreview && !picked) options.onActive?.(null);
    options.onClose?.();
  }

  function onListKey(event: KeyboardEvent): void {
    if (isMoveKey(event.key)) {
      event.preventDefault();
      const next = moveActive(active, event.key, shown.length);
      setActive(next, true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = active === null ? undefined : shown[active];
      if (chosen) pick(chosen.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      shut(false, true);
      trigger.focus();
    } else if (event.key === 'Tab') {
      shut(false, true);
    }
  }

  function open(): void {
    if (list || trigger.disabled) return;
    query = '';
    const box = document.createElement('div');
    box.className = 'k-pop k-select-list';
    box.id = listId;
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', options.label);
    list = box;
    optionsBox = document.createElement('div');
    if (searchable) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'k-field k-select-search';
      input.placeholder = options.search.label;
      input.setAttribute('aria-label', options.search.label);
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-controls', listId);
      input.setAttribute('autocomplete', 'off');
      input.addEventListener('input', () => {
        query = input.value;
        drawOptions();
        setActive(shown.length > 0 ? 0 : null, true);
      });
      searchInput = input;
      box.append(input);
    } else box.tabIndex = -1;
    box.append(optionsBox);
    box.addEventListener('keydown', onListKey);
    box.addEventListener('pointerleave', () => {
      if (active !== null) setActive(null, true);
    });
    drawOptions();
    document.body.append(box);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('data-open-list', '');
    place();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    window.addEventListener('blur', onBlur);
    const at = shown.findIndex((entry) => entry.value === current);
    setActive(at >= 0 ? at : null, false);
    (searchInput ?? box).focus();
  }

  trigger.addEventListener('click', () => (list ? shut(false, true) : open()));
  trigger.addEventListener('keydown', (event) => {
    if (list) return;
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      open();
      return;
    }
    if (options.stepKeys === false || event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const at = items.findIndex((entry) => entry.value === current);
    const down = event.key === 'ArrowDown';
    const next = at < 0 ? (down ? 0 : items.length - 1) : at + (down ? 1 : -1);
    const item = items[next];
    if (!item || item.value === current) return;
    current = item.value;
    drawTrigger();
    options.onPick(item.value);
  });

  drawTrigger();

  return {
    root,
    trigger,
    show(value) {
      current = value;
      drawTrigger();
    },
    open,
    close() {
      shut(false, true);
    },
  };
}
