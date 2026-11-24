// The `?` list of shortcuts (plan 15, task A): a dialog with a search field over the one table in
// `shortcuts.ts`, by group. Esc closes it (the dialog's own), and the focus goes back to where it
// was. It is built on first use, so a page that never asks for it carries none of it.

import { text } from '../edit/texts.ts';
import { isMac, type ShortcutSection, shortcutSections } from './shortcuts.ts';

export type ShortcutsDialog = {
  toggle(): void;
  isOpen(): boolean;
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function sectionOf(part: ShortcutSection): HTMLElement {
  const box = element('section', 'editor-shortcuts-group');
  const rows = element('ul', 'editor-shortcuts-rows');
  rows.setAttribute('role', 'list');
  for (const line of part.lines) {
    const keys = element('span', 'editor-shortcuts-keys');
    line.keys.forEach((combo, index) => {
      if (index > 0) keys.append(element('span', 'editor-shortcuts-or', text('shortcuts.or')));
      combo.forEach((name, at) => {
        if (at > 0) keys.append('+');
        keys.append(element('kbd', undefined, name));
      });
    });
    const row = element('li', 'editor-shortcuts-row');
    row.dataset.shortcut = line.id;
    row.append(element('span', 'editor-shortcuts-label', line.label), keys);
    rows.append(row);
  }
  box.append(element('h3', undefined, part.title), rows);
  return box;
}

export function mountShortcuts(main: HTMLElement): ShortcutsDialog {
  const mac = isMac(navigator.platform);
  let dialog: HTMLDialogElement | null = null;
  let search: HTMLInputElement | null = null;
  let list: HTMLElement | null = null;
  /** Where the focus was before the list opened. */
  let back: HTMLElement | null = null;

  function draw(query: string): void {
    if (!list) return;
    const sections = shortcutSections(query, mac, (key) => text(key));
    list.replaceChildren(
      ...(sections.length === 0
        ? [element('p', 'editor-shortcuts-none', text('shortcuts.none'))]
        : sections.map(sectionOf)),
    );
  }

  function build(): HTMLDialogElement {
    const box = element('dialog', 'editor-shortcuts');
    box.setAttribute('aria-labelledby', 'editor-shortcuts-title');
    const head = element('div', 'editor-shortcuts-head');
    const title = element('h2', undefined, text('shell.shortcuts'));
    title.id = 'editor-shortcuts-title';
    const close = element('button', 'editor-act', text('shortcuts.close'));
    close.type = 'button';
    close.addEventListener('click', () => box.close());
    head.append(title, close);
    const field = element('input', 'editor-shortcuts-search');
    field.type = 'search';
    field.placeholder = text('shortcuts.search');
    field.setAttribute('aria-label', text('shortcuts.search'));
    field.addEventListener('input', () => draw(field.value));
    const rows = element('div', 'editor-shortcuts-list');
    box.append(head, field, rows);
    box.addEventListener('close', () => {
      back?.focus();
      back = null;
    });
    // A click on the backdrop lands on the dialog itself, outside its box: it closes the list.
    box.addEventListener('click', (event) => {
      if (event.target !== box) return;
      const edge = box.getBoundingClientRect();
      const inside =
        event.clientX >= edge.left &&
        event.clientX <= edge.right &&
        event.clientY >= edge.top &&
        event.clientY <= edge.bottom;
      if (!inside) box.close();
    });
    document.body.append(box);
    search = field;
    list = rows;
    return box;
  }

  function open(): void {
    dialog ??= build();
    if (dialog.open) return;
    back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (search) search.value = '';
    draw('');
    dialog.showModal();
    search?.focus();
  }

  const toggle = (): void => {
    if (dialog?.open) dialog.close();
    else open();
  };

  // The `?` button of the top bar; on `main`, so the button may be drawn again.
  main.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-shell="shortcuts"]')) {
      toggle();
    }
  });

  return { toggle, isOpen: () => dialog?.open === true };
}
