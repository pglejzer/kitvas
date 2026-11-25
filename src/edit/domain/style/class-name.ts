// The class a style edit gives an element that has none (ADR 0067). Every section's styles end in
// one stylesheet, so a bare `button` written for one section would style the buttons of all the
// others: the name is `<block>__<part>`. `block` is the one class of the root element of the JSX
// the element is in (the element a section's function returns), up to its first `__` or `--`,
// else the file's name in kebab case; `part` is the tag in kebab case. That root itself takes the
// block alone while no one has it. A name either file uses already gets `-2`, `-3`.

import { CLASS_NAME } from '../ops.ts';
import { parentOf } from '../structure/subtree.ts';
import { readTag } from '../tsx/tsx-reader.ts';
import { readRules } from './scss-rules.ts';

/** `Card.Header` becomes `card-header`: a class name kitvas may write (`CLASS_NAME`). */
export function classNameOf(tag: string): string {
  const words = tag
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const name = /^[a-z]/.test(words) ? words : `el-${words}`;
  // Room for a `-12` after it within the 64 characters of a class name.
  return name.slice(0, 56).replace(/-+$/, '');
}

/** The `<` of the root element of the JSX the element at `at` is in. */
export function rootOf(tsx: string, at: number): number {
  let current = at;
  for (;;) {
    const parent = parentOf(tsx, current);
    // A parent always opens before its child; anything else would walk in a circle.
    if (parent === null || parent >= current) return current;
    current = parent;
  }
}

/**
 * The block of the new classes under `root`: its one class, else the file's name. A helper
 * component's root may be a part of the block already: `plans__card` is in the block `plans`.
 */
export function blockOf(tsx: string, root: number, file: string): string {
  const tag = readTag(tsx, root);
  const written =
    typeof tag === 'string' || tag.className?.kind !== 'string'
      ? []
      : tag.className.value.split(/\s+/).filter((name) => name !== '');
  const [only] = written;
  if (written.length === 1 && only !== undefined && CLASS_NAME.test(only)) {
    return only.split(/__|--/)[0] ?? only;
  }
  const name = file.split('/').at(-1) ?? file;
  return classNameOf(name.replace(/\.[^.]*$/, ''));
}

export type NewClass = {
  /** The element's tag: `Button`, `Card.Header`, `div`. */
  tag: string;
  /** The section's TSX, and the `<` of the element in it. */
  tsx: string;
  at: number;
  /** The TSX file, `src/tsx/sections/Plans.tsx`. */
  file: string;
  /** The section's SCSS; `''` without one. */
  scss: string;
  /** Every class the TSX writes, in a string `className` or in a string inside `className={…}`. */
  taken: ReadonlySet<string>;
};

/** At most 56 characters, room for a `-12` after it, never ending in `-` or `_`. */
const cut = (name: string): string => name.slice(0, 56).replace(/[-_]+$/, '');

/** The new class of the element: `plans__button`, or `plans__button-2` when that one is used. */
export function newClassName(input: NewClass): string {
  const { tsx, at, scss, taken } = input;
  const root = rootOf(tsx, at);
  const block = cut(blockOf(tsx, root, input.file));
  // A rule nested as `&__button` names `plans__button` without writing it out.
  const ruled = new Set(readRules(scss).map((rule) => rule.view.className));
  const used = (name: string): boolean =>
    taken.has(name) || ruled.has(name) || new RegExp(`\\.${name}(?![\\w-])`).test(scss);
  const base = root === at && !used(block) ? block : cut(`${block}__${classNameOf(input.tag)}`);
  let name = base;
  for (let n = 2; used(name); n += 1) name = `${base}-${n}`;
  return name;
}
