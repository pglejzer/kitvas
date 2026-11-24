// Another kit component in an element's place (spec 4b, decision 2 `replaceTag`; plan 14, task
// B4): the new opening tag, built from the catalog. The props both components take stay exactly
// as they are written; every other one is dropped and named, so the change list can say so (spec
// section 4: no silently dropped props). The children are never touched: the structural engine
// swaps the opening tag and the closing tag's name (`replaceOpen`).

import type { KitComponent } from '../../../kit/index.ts';
import type { PropValue } from '../../domain/ops.ts';
import { childrenOf, elementSpan, freeIdentifiers } from '../../domain/structure/subtree.ts';
import { openingTags, readTag } from '../../domain/tsx/tsx-reader.ts';
import type { PropView, Refusal, Span, TagView } from '../../domain/types.ts';

type CatalogProp = KitComponent['props'][number];

/** `open`: the new opening tag (`/>` when the element closes itself); `dropped`: prop names. */
export type ReplacedOpen = { open: string; dropped: string[] };

/** Props React itself reads: they mean the same on any component. */
const REACT_PROPS = new Set(['key', 'ref']);

/** An attribute of the old tag, its span counted from the tag's `<`; `prop: null`: `className`. */
type Attr = { name: string; start: number; end: number; prop: PropView | null };
/** The old opening tag as written, and where each attribute is in it. */
type Layout = { text: string; name: string; attrs: Attr[] };

/** A literal as JSX writes it: `name="v"`, `name={3}`, `name`, `name={false}`. */
function literalAttr(name: string, value: string | number | boolean): string {
  if (typeof value === 'number') return `${name}={${value}}`;
  if (typeof value === 'boolean') return value ? name : `${name}={false}`;
  if (!value.includes('"')) return `${name}="${value}"`;
  return value.includes("'") ? `${name}={${JSON.stringify(value)}}` : `${name}='${value}'`;
}

type Written = { name: string; span: Span; prop: PropView | null };

/** The attributes in source order, `className` among them. */
function attrsOf(view: TagView): Written[] {
  const named = view.props.map((prop): Written => ({ name: prop.name, span: prop.span, prop }));
  if (view.className !== null) {
    named.push({ name: 'className', span: view.className.span, prop: null });
  }
  return named.sort((a, b) => a.span.start - b.span.start);
}

/** An attribute written again from what the view holds, for a tag whose text is not at hand. */
function attrText(view: TagView, prop: PropView | null): string {
  if (prop !== null) {
    if (prop.kind === 'expr') return `${prop.name}={${prop.source}}`;
    return literalAttr(prop.name, prop.value.value);
  }
  const written = view.className;
  if (written === null) return '';
  return written.kind === 'string'
    ? literalAttr('className', written.value)
    : `className={${written.source}}`;
}

/**
 * The opening tag as the file writes it, so the new one keeps its layout (one attribute per line
 * stays so). Without the file's text the tag is written again on one line from the view.
 */
function layoutOf(view: TagView, text: string | undefined): Layout {
  const { start, end } = view.span;
  const written = attrsOf(view);
  if (text !== undefined && end <= text.length && text.startsWith(`<${view.name}`, start)) {
    return {
      text: text.slice(start, end),
      name: view.name,
      attrs: written.map(({ name, span, prop }) => ({
        name,
        start: span.start - start,
        end: span.end - start,
        prop,
      })),
    };
  }
  let out = `<${view.name}`;
  const attrs: Attr[] = [];
  for (const { name, prop } of written) {
    out += ' ';
    const at = out.length;
    out += attrText(view, prop);
    attrs.push({ name, start: at, end: out.length, prop });
  }
  return { text: `${out}${view.selfClosing ? ' />' : '>'}`, name: view.name, attrs };
}

// ---- Which props stay ----------------------------------------------------------------------------

/** A literal the new component's prop takes: an enum only one of its values. */
function literalFits(prop: CatalogProp, value: PropValue): boolean {
  switch (prop.type) {
    case 'enum':
      if (value.kind !== 'string') return false;
      return prop.values === undefined || prop.values.includes(value.value);
    case 'string':
    case 'component':
      return value.kind === 'string';
    case 'number':
      return value.kind === 'number';
    case 'boolean':
      return value.kind === 'boolean';
    case 'node':
      return value.kind !== 'boolean';
    case 'union':
      return true;
    default:
      return false;
  }
}

/**
 * An expression stays where it cannot hold a value the new prop rejects: for an enum, only when
 * the old component's prop is an enum whose every value the new one has; else when the old prop
 * has the same type, or there is no old catalog prop to tell.
 */
function expressionFits(prop: CatalogProp, old: CatalogProp | undefined): boolean {
  if (prop.type === 'enum') {
    const values = prop.values;
    if (old?.type !== 'enum' || old.values === undefined || values === undefined) return false;
    return old.values.every((value) => values.includes(value));
  }
  return old === undefined || old.type === prop.type || prop.type === 'union';
}

function stays(attr: Attr, to: KitComponent, part: boolean, old: KitComponent | null): boolean {
  if (REACT_PROPS.has(attr.name)) return true;
  // A part's styling is not in the catalog: its root's word is the best there is.
  if (attr.name === 'className' || attr.name === 'style') {
    return part || to.styling.includes(attr.name);
  }
  // A part takes none of its root's catalog props (as the inspect panel reads them).
  if (part || attr.prop === null) return false;
  const prop = to.props.find((each) => each.name === attr.name);
  if (prop === undefined) return false;
  if (attr.prop.kind === 'literal') return literalFits(prop, attr.prop.value);
  return expressionFits(
    prop,
    old?.props.find((each) => each.name === attr.name),
  );
}

/**
 * A required prop as the catalog's examples of the component write it (spec decision 10: the
 * examples carry the sample props). An expression is taken only from an example that reads
 * nothing but the kit components it imports.
 */
function fromExample(to: KitComponent, name: string): string | null {
  for (const example of to.examples) {
    const allowed = new Set(example.imports);
    for (const at of openingTags(example.code)) {
      const tag = readTag(example.code, at);
      if (typeof tag === 'string' || tag.name !== to.name) continue;
      const prop = tag.props.find((each) => each.name === name);
      if (prop === undefined) continue;
      const written = example.code.slice(prop.span.start, prop.span.end);
      if (prop.kind === 'literal') return written;
      const span = elementSpan(example.code, at);
      const free = span === null ? null : freeIdentifiers(example.code, span);
      if (free?.every((each) => allowed.has(each))) return written;
    }
  }
  return null;
}

/**
 * The props the new component needs that the tag does not keep, each with its catalog default or
 * as an example writes it. `null` when one has neither: the element would not render.
 */
function neededAttrs(to: KitComponent, kept: ReadonlySet<string>): string[] | null {
  const added: string[] = [];
  for (const prop of to.props) {
    if (prop.required !== true || prop.name === 'children' || kept.has(prop.name)) continue;
    const fallback = prop.default;
    const written =
      fallback === undefined ? fromExample(to, prop.name) : literalAttr(prop.name, fallback);
    if (written === null) return null;
    added.push(written);
  }
  return added;
}

const takesChildren = (to: KitComponent): boolean =>
  to.props.some((prop) => prop.name === 'children' && prop.type === 'node');

/** Whether the element holds anything between its tags; without the text, any open pair does. */
function hasChildren(view: TagView, text: string | undefined): boolean {
  if (view.selfClosing) return false;
  if (text === undefined) return true;
  const children = childrenOf(text, view.span.start);
  return children === null || children.length > 0;
}

// ---- Writing the tag -----------------------------------------------------------------------------

/** Where the whitespace in front of `at` starts, never before `floor`. */
function leadStart(text: string, at: number, floor: number): number {
  let i = at;
  while (i > floor && /\s/.test(text.charAt(i - 1))) i -= 1;
  return i;
}

/**
 * The old tag with the new name, each dropped attribute cut out with the whitespace in front of
 * it, and the added ones after the last kept one, each with that one's lead (its own line in a
 * tag written one attribute per line). What stands between attributes otherwise (a comment)
 * stays, and so does the end of the tag.
 */
function assemble(
  layout: Layout,
  tag: string,
  keep: readonly boolean[],
  added: readonly string[],
  selfClosing: boolean,
): string {
  const { text, attrs } = layout;
  let cursor = 1 + layout.name.length;
  let out = `<${tag}`;
  let lead = '';
  let firstLead = '';
  for (const [i, attr] of attrs.entries()) {
    const cut = leadStart(text, attr.start, cursor);
    if (i === 0) firstLead = text.slice(cut, attr.start);
    out += text.slice(cursor, cut);
    if (keep[i] === true) {
      out += text.slice(cut, attr.end);
      lead = text.slice(cut, attr.start);
    }
    cursor = attr.end;
  }
  if (out === `<${tag}` && added.length === 0) return `<${tag}${selfClosing ? ' />' : '>'}`;
  const sep = lead || firstLead || ' ';
  return `${out}${added.map((attr) => `${sep}${attr}`).join('')}${text.slice(cursor)}`;
}

/**
 * The opening tag of `to`, or of its part `tag` (`Card.Header`), for the element `view` reads.
 * `from`: the element's own catalog component (`null` for an HTML tag or an unlisted one).
 * - Kept: `key`, `ref`, `className` and `style` when the new component takes them, and each
 *   written prop the new component has, with a value it takes (an enum literal is one of its
 *   values). Dropped and listed: the rest. A needed prop the tag lacks comes from the catalog.
 * - Refused: a `tag` that is not `to` or its part (`unknown-component`), a spread (`spread`: it
 *   may set anything), children for a component without `children: node` (`not-accepted`), a
 *   needed prop the catalog gives no value for (`invalid`).
 * - `text`: the file's text `view` was read from. With it the tag keeps its own layout, and an
 *   empty element is told from one with children.
 */
export function replaceTagOpen(
  view: TagView,
  from: KitComponent | null,
  to: KitComponent,
  tag: string,
  text?: string,
): ReplacedOpen | { refused: Refusal } {
  const part = tag !== to.name;
  const partName = tag.slice(to.name.length + 1);
  if (part && !(tag.startsWith(`${to.name}.`) && to.parts.includes(partName))) {
    return { refused: 'unknown-component' };
  }
  const layout = layoutOf(view, text);
  if (tag === view.name) return { open: layout.text, dropped: [] };
  if (view.spread) return { refused: 'spread' };
  if (!part && !takesChildren(to) && hasChildren(view, text)) return { refused: 'not-accepted' };

  const old = view.name.includes('.') || from?.name !== view.name ? null : from;
  const keep = layout.attrs.map((attr) => stays(attr, to, part, old));
  const kept = new Set(layout.attrs.filter((_, i) => keep[i]).map((attr) => attr.name));
  const added = part ? [] : neededAttrs(to, kept);
  if (added === null) return { refused: 'invalid' };
  return {
    open: assemble(layout, tag, keep, added, view.selfClosing),
    dropped: layout.attrs.filter((_, i) => !keep[i]).map((attr) => attr.name),
  };
}
