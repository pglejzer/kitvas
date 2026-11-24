// "This looks like <Component> from the kit" (spec 4d, goal 6): for a plain JSX element a kit
// component covers, the component's name and the element's source written with it. The tag swap
// is the one `replaceTag` makes (`structure/replace-tag.ts`): children kept, the props both take
// kept, the rest named in `dropped`. The panel sends `source` as `replaceElement`, which adds the
// kit import. An empty `source` means there is no safe replacement and the panel offers Ask Claude.

import type { KitComponent } from '../../../kit/index.ts';
import { elementSpan } from '../../domain/structure/subtree.ts';
import type { TagView } from '../../domain/types.ts';
import { replaceTagOpen } from '../structure/replace-tag.ts';
import { CARD_TAGS, cardComponent, componentForTag } from './categories.ts';

export type Suggest = { component: string; source: string; dropped: string[] };

export type SuggestInput = {
  /** The file's text and the offset of the element's `<`. */
  text: string;
  at: number;
  view: TagView;
  /** The catalog component the element already is; a kit component is never suggested over. */
  own: KitComponent | null;
  catalog: readonly KitComponent[];
  format: 'scss' | 'tailwind';
  /** The properties the element's own class rule declares (SCSS drafts). */
  properties: readonly string[];
  /** The element's classes (Tailwind drafts). */
  classes: readonly string[];
};

/** The most a suggestion's source may be (`InspectSchema`). */
export const MAX_SUGGEST_SOURCE = 20_000;
const MAX_NAME = 80;
const MAX_DROPPED = 40;

const hasProperty = (properties: readonly string[], test: (name: string) => boolean): boolean =>
  properties.some(test);

/** Background, border radius and padding all set by the element's own SCSS rule. */
function scssCard(properties: readonly string[]): boolean {
  return (
    hasProperty(properties, (name) => name === 'background-color' || name === 'background') &&
    hasProperty(properties, (name) => name === 'border-radius') &&
    hasProperty(properties, (name) => name.startsWith('padding'))
  );
}

/** The same three, from the utility classes of a Tailwind draft (no variant prefix counts). */
function utilityCard(classes: readonly string[]): boolean {
  const base = classes.filter((name) => !name.includes(':'));
  return (
    base.some((name) => /^bg-/.test(name)) &&
    base.some((name) => name === 'rounded' || name.startsWith('rounded-')) &&
    base.some((name) => /^p[xytrblse]?-/.test(name))
  );
}

/** A `div` or `section` styled like a card: background, radius and padding of its own. */
export function looksLikeCard(
  input: Pick<SuggestInput, 'format' | 'properties' | 'classes'>,
): boolean {
  return input.format === 'tailwind' ? utilityCard(input.classes) : scssCard(input.properties);
}

/** `type="button"` is what a native button does anyway: the kit's one does not need it named. */
function quietDrops(view: TagView, dropped: readonly string[]): string[] {
  const silent = view.props.some(
    (prop) =>
      prop.name === 'type' &&
      view.name === 'button' &&
      prop.kind === 'literal' &&
      prop.value.kind === 'string' &&
      prop.value.value === 'button',
  );
  return dropped.filter((name) => !(silent && name === 'type'));
}

/** The element's source with the component's tag at its opening and its closing end. */
function rewritten(
  input: SuggestInput,
  to: KitComponent,
): { source: string; dropped: string[] } | null {
  const { text, at, view } = input;
  const span = elementSpan(text, at);
  if (span === null) return null;
  const made = replaceTagOpen(view, input.own, to, to.name, text);
  if ('refused' in made) return null;
  const element = text.slice(span.start, span.end);
  const body = element.slice(view.span.end - span.start);
  const close = new RegExp(`</\\s*${view.name}\\s*>\\s*$`);
  if (!view.selfClosing && !close.test(body)) return null;
  const source = view.selfClosing
    ? made.open
    : `${made.open}${body.replace(close, `</${to.name}>`)}`;
  if (source.length > MAX_SUGGEST_SOURCE) return null;
  return { source, dropped: quietDrops(view, made.dropped) };
}

/** The component a plain element looks like, or `null` when there is none to offer. */
export function suggestFor(input: SuggestInput): Suggest | null {
  const { view } = input;
  if (input.own !== null || !/^[a-z][a-z0-9]*$/.test(view.name)) return null;
  const to =
    componentForTag(view.name, input.catalog) ??
    (CARD_TAGS.has(view.name) && looksLikeCard(input) ? cardComponent(input.catalog) : null);
  if (to === null) return null;
  const made = rewritten(input, to);
  return {
    component: to.name.slice(0, MAX_NAME),
    source: made?.source ?? '',
    dropped: (made?.dropped ?? []).slice(0, MAX_DROPPED).map((name) => name.slice(0, MAX_NAME)),
  };
}
