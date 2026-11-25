// Runs in the page, after the facts walk: the form fields, actions (buttons and links) and images
// among its nodes. The accessible name approximates the browser's: aria-labelledby, aria-label, a
// label element, the text, title and alt. A label that exists but cannot be seen (the visually
// hidden pattern) is `hidden`, so a field named only for screen readers is told apart from one
// with a label on screen.
//
// Everything here is serialized into the page: it uses no name from outside the function, only
// the node list and the helpers the walk left on `window` (`playwright-facts-walk.ts`).

import type { ActionFacts, FieldFacts, ImageFacts } from '../../domain/page/facts.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';

export type ControlFacts = {
  node: number;
  field: FieldFacts | null;
  action: ActionFacts | null;
  image: ImageFacts | null;
};

export function readControls(): ControlFacts[] {
  const scope = window as unknown as FactsWindow;
  const nodes = scope.__KITVAS_NODES__;
  const tools = scope.__KITVAS_TOOLS__;
  if (nodes === undefined || tools === undefined) return [];
  /** Inputs that are buttons, not fields. */
  const BUTTON_TYPES = new Set(['submit', 'button', 'reset', 'image']);
  /** Elements whose content is no part of a name: controls and what never renders. */
  const SKIP = new Set(['script', 'style', 'template', 'noscript', 'input', 'select', 'textarea']);
  /** Longer values are cut: the rules compare them, they never show them whole. */
  const VALUE_MAX = 500;
  const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const roleOf = (element: Element): string | null => {
    const value = (element.getAttribute('role') ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
    return value === '' ? null : value;
  };

  /**
   * The text of an element. 'name' is what a screen reader hears: aria-hidden parts left out,
   * visually hidden parts, image alt and svg titles kept. 'visible' is what shows on screen.
   */
  const textOf = (from: Element, mode: 'name' | 'visible'): string => {
    const parts: string[] = [];
    const visit = (parent: Element): void => {
      for (const child of Array.from(parent.childNodes)) {
        if (child instanceof Text) {
          parts.push(child.data);
          continue;
        }
        if (!(child instanceof Element)) continue;
        const tag = child.tagName.toLowerCase();
        if (SKIP.has(tag)) continue;
        const style = getComputedStyle(child);
        if (style.display === 'none') continue;
        if (mode === 'name' && child.getAttribute('aria-hidden') === 'true') continue;
        if (mode === 'visible' && (style.visibility === 'hidden' || tools.hidden(child))) continue;
        if (tag === 'img') {
          if (mode === 'name') parts.push(` ${child.getAttribute('alt') ?? ''} `);
          continue;
        }
        if (tag === 'svg') {
          const title = child.querySelector('title');
          if (mode === 'name' && title !== null) parts.push(` ${title.textContent ?? ''} `);
          continue;
        }
        // A block inside separates words, as it does on screen.
        const block = style.display !== 'inline';
        if (block) parts.push(' ');
        visit(child);
        if (block) parts.push(' ');
      }
    };
    visit(from);
    return clean(parts.join(''));
  };
  /** The elements an id-list attribute points at, in order; missing ids are skipped. */
  const refs = (element: Element, attribute: string): Element[] =>
    (element.getAttribute(attribute) ?? '')
      .split(/\s+/)
      .filter((id) => id !== '')
      .map((id) => document.getElementById(id))
      .filter((found): found is HTMLElement => found !== null);
  const referenced = (element: Element, attribute: string): string =>
    clean(
      refs(element, attribute)
        .map((target) => textOf(target, 'name'))
        .join(' '),
    );
  /** On screen: a box larger than a pixel, not visually hidden, not transparent or invisible. */
  const shown = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 1 &&
      rect.height > 1 &&
      !tools.hidden(element) &&
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  };
  /** Laid out at all, even if visually hidden. */
  const rendered = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 && rect.height > 0 && element.checkVisibility({ visibilityProperty: true })
    );
  };

  const fieldOf = (element: Element): FieldFacts | null => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      return null;
    }
    const input = element instanceof HTMLInputElement ? element : null;
    if (input !== null && (input.type === 'hidden' || BUTTON_TYPES.has(input.type))) return null;
    const control: FieldFacts['control'] =
      input !== null ? 'input' : element instanceof HTMLSelectElement ? 'select' : 'textarea';
    const type = input !== null ? input.type.toLowerCase() : control;
    let value = element.value;
    if (input !== null && (type === 'checkbox' || type === 'radio')) {
      value = input.checked ? input.value || 'on' : '';
    } else if (type === 'password' || type === 'file') {
      value = '';
    }
    const placeholder = clean(element.getAttribute('placeholder') ?? '');

    // How the field is named: a label on screen first, then one that is hidden, then the rest.
    const sources = [
      ...refs(element, 'aria-labelledby'),
      ...Array.from(element.labels ?? []),
    ].filter((source) => textOf(source, 'name') !== '');
    const visible = sources.find((source) => shown(source) && textOf(source, 'visible') !== '');
    const unseen = sources[0];
    const aria =
      clean(element.getAttribute('aria-label') ?? '') || clean(element.getAttribute('title') ?? '');
    let label: FieldFacts['label'] = 'none';
    let labelText = '';
    if (visible !== undefined) {
      label = 'visible';
      labelText = textOf(visible, 'visible');
    } else if (unseen !== undefined) {
      label = 'hidden';
      labelText = textOf(unseen, 'name');
    } else if (aria !== '') {
      label = 'aria';
      labelText = aria;
    } else if (placeholder !== '') {
      label = 'placeholder';
      labelText = placeholder;
    }
    // A mark can be written by the label's ::before or ::after, as `*` often is.
    const marked = visible ?? unseen;
    const pseudo =
      marked === undefined
        ? ''
        : ['::before', '::after']
            .map((part) => getComputedStyle(marked, part).content)
            .filter((content) => content !== 'none' && content !== 'normal')
            .join(' ');
    const markText = `${labelText} ${pseudo}`;

    const group = element.closest('fieldset, [role="group"], [role="radiogroup"]');
    let groupName = '';
    if (group !== null) {
      const legend = Array.from(group.children).find(
        (child) => child.tagName.toLowerCase() === 'legend',
      );
      groupName =
        (group instanceof HTMLFieldSetElement && legend !== undefined
          ? textOf(legend, 'name')
          : '') ||
        referenced(group, 'aria-labelledby') ||
        clean(group.getAttribute('aria-label') ?? '');
    }
    const described = [
      ...refs(element, 'aria-describedby').map((target) => ({ target, errorMessage: false })),
      ...refs(element, 'aria-errormessage').map((target) => ({ target, errorMessage: true })),
    ].map(({ target, errorMessage }) => ({
      text: textOf(target, 'name'),
      box: rendered(target) ? tools.box(target) : null,
      errorMessage,
    }));
    return {
      control,
      type,
      name: element.getAttribute('name') ?? '',
      value: value.slice(0, VALUE_MAX),
      placeholder,
      required: element.required || element.getAttribute('aria-required') === 'true',
      invalid: element.getAttribute('aria-invalid') === 'true',
      autocomplete: clean(element.getAttribute('autocomplete') ?? '').toLowerCase(),
      label,
      labelText,
      labelBox: visible === undefined ? null : tools.box(visible),
      described,
      group: group === null ? -1 : tools.index(group),
      groupName,
      form: element.form === null ? -1 : tools.index(element.form),
      mark: /\*|\brequired\b/i.test(markText)
        ? 'required'
        : /\boptional\b/i.test(markText)
          ? 'optional'
          : null,
    };
  };

  /**
   * The lines the visible label takes: its text nodes' line boxes grouped by the band they sit in,
   * as the text facts count them. An input button, an empty label and parts that cannot be seen
   * count as one.
   */
  const labelLines = (element: Element): number => {
    if (element instanceof HTMLInputElement) return 1;
    const texts: Text[] = [];
    const collect = (parent: Element): void => {
      for (const child of Array.from(parent.childNodes)) {
        if (child instanceof Text) {
          if (child.data.trim() !== '') texts.push(child);
          continue;
        }
        if (!(child instanceof Element) || SKIP.has(child.tagName.toLowerCase())) continue;
        const tag = child.tagName.toLowerCase();
        if (tag === 'svg' || tag === 'img') continue;
        const style = getComputedStyle(child);
        if (style.display === 'none' || style.visibility === 'hidden' || tools.hidden(child)) {
          continue;
        }
        collect(child);
      }
    };
    collect(element);
    const range = document.createRange();
    const bands: { top: number; bottom: number }[] = [];
    for (const text of texts) {
      range.selectNodeContents(text);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const middle = rect.top + rect.height / 2;
        const band = bands.find((entry) => middle >= entry.top && middle <= entry.bottom);
        if (band === undefined) {
          bands.push({ top: rect.top, bottom: rect.bottom });
        } else {
          band.top = Math.min(band.top, rect.top);
          band.bottom = Math.max(band.bottom, rect.bottom);
        }
      }
    }
    return Math.max(1, bands.length);
  };

  const actionOf = (element: Element, role: string | null): ActionFacts | null => {
    const tag = element.tagName.toLowerCase();
    const input =
      element instanceof HTMLInputElement && BUTTON_TYPES.has(element.type) ? element : null;
    const link =
      ((tag === 'a' || tag === 'area') && element.hasAttribute('href')) || role === 'link';
    const button = tag === 'button' || input !== null || role === 'button';
    if (!link && !button) return null;
    // An explicit role wins: a link styled and announced as a button is a button.
    const kind: ActionFacts['kind'] = role === 'button' ? 'button' : link ? 'link' : 'button';
    const fallback = input?.type === 'submit' ? 'Submit' : input?.type === 'reset' ? 'Reset' : '';
    const shownText =
      input === null
        ? textOf(element, 'visible')
        : input.type === 'image'
          ? ''
          : clean(input.value) || fallback;
    let name =
      referenced(element, 'aria-labelledby') || clean(element.getAttribute('aria-label') ?? '');
    if (name === '' && input !== null) {
      name =
        input.type === 'image' ? clean(input.alt) || clean(input.value) || 'Submit' : shownText;
    }
    if (name === '') name = textOf(element, 'name') || clean(element.getAttribute('title') ?? '');
    const submit =
      element instanceof HTMLButtonElement
        ? element.type === 'submit'
        : input !== null && (input.type === 'submit' || input.type === 'image');
    return {
      kind,
      name,
      text: shownText,
      href: kind === 'link' ? element.getAttribute('href') : null,
      submit,
      disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      menu: element.hasAttribute('aria-haspopup') || element.hasAttribute('aria-expanded'),
      current: element.getAttribute('aria-current'),
      lines: labelLines(element),
    };
  };

  const imageOf = (element: HTMLImageElement): ImageFacts => ({
    natural: [element.naturalWidth, element.naturalHeight],
    sized:
      (element.hasAttribute('width') && element.hasAttribute('height')) ||
      getComputedStyle(element).aspectRatio !== 'auto',
    alt: element.getAttribute('alt'),
    vector: /^data:image\/svg\+xml|\.svg([?#]|$)/i.test(element.currentSrc || element.src),
  });

  const controls: ControlFacts[] = [];
  nodes.forEach((element, node) => {
    try {
      const field = fieldOf(element);
      const action = field === null ? actionOf(element, roleOf(element)) : null;
      const image = element instanceof HTMLImageElement ? imageOf(element) : null;
      if (field !== null || action !== null || image !== null) {
        controls.push({ node, field, action, image });
      }
    } catch {
      // A control that cannot be read keeps the walk's nulls.
    }
  });
  return controls;
}
