// Which kit component a plain element looks like (spec 4d, goal 6): the tag's category table (the
// `ds/raw-control` table of `src/checks/domain/code/code.ts` is its start), then the card rule.

import type { KitComponent } from '../../../kit/index.ts';

/** The category of a plain tag; a tag not listed is never suggested. */
const TAG_CATEGORY: Readonly<Record<string, string>> = {
  button: 'action',
  input: 'input',
  select: 'input',
  textarea: 'input',
  dialog: 'overlay',
  h1: 'typography',
  h2: 'typography',
  h3: 'typography',
  h4: 'typography',
  h5: 'typography',
  h6: 'typography',
  p: 'typography',
  a: 'navigation',
};

/** The names a tag's component usually has, best first. */
const NAMES: Readonly<Record<string, readonly string[]>> = {
  button: ['Button'],
  input: ['Input', 'TextField', 'TextInput'],
  select: ['Select'],
  textarea: ['Textarea', 'TextArea'],
  dialog: ['Dialog', 'Modal'],
  h1: ['Heading', 'Title'],
  h2: ['Heading', 'Title'],
  h3: ['Heading', 'Title'],
  h4: ['Heading', 'Title'],
  h5: ['Heading', 'Title'],
  h6: ['Heading', 'Title'],
  p: ['Text', 'Paragraph'],
  a: ['Link'],
};

/** Controls have one obvious kind of component; text and links are only suggested by name. */
const ANY_OF_CATEGORY = new Set(['action', 'input', 'overlay']);

/** A card, panel, surface or box: the components a styled `div` or `section` stands for. */
export const CARD_NAME = /card|panel|surface|box/i;
const CARD_CATEGORIES = new Set(['layout', 'display']);

/** The tags a card rule may turn into a component. */
export const CARD_TAGS = new Set(['div', 'section']);

const usable = (component: KitComponent): boolean => !component.deprecated;

/** The component a plain `tag` looks like; `null` when the tag or the catalog gives none. */
export function componentForTag(
  tag: string,
  catalog: readonly KitComponent[],
): KitComponent | null {
  if (!Object.hasOwn(TAG_CATEGORY, tag)) return null;
  const category = TAG_CATEGORY[tag];
  const named = NAMES[tag] ?? [];
  for (const name of named) {
    const found = catalog.find(
      (component) =>
        component.name === name && component.category === category && usable(component),
    );
    if (found !== undefined) return found;
  }
  if (category === undefined || !ANY_OF_CATEGORY.has(category)) return null;
  return catalog.find((each) => each.category === category && usable(each)) ?? null;
}

/** The card-like component of the catalog: `Card` first, else the first one named like one. */
export function cardComponent(catalog: readonly KitComponent[]): KitComponent | null {
  const fits = catalog.filter(
    (component) =>
      usable(component) &&
      CARD_CATEGORIES.has(component.category) &&
      CARD_NAME.test(component.name),
  );
  return fits.find((component) => component.name === 'Card') ?? fits[0] ?? null;
}
