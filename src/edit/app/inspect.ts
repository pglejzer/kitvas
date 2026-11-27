// One element as its source writes it, for the properties panel (plan 13, task D2): the tag and
// its props, the kit component it is, its text, the class a style edit writes and where each
// style property's value comes from (spec decisions 3, 4 and 9). Plan 15 adds the element's line
// and the version's images, for the panel's header and its background image picker. Plan 18f
// (task 2) adds `source`, the facts of the panel's Source strip (`inspect-source.ts`).

import { type DraftStore, latestVersion, loadDraft, versionFolder } from '../../drafts/index.ts';
import {
  DEFAULT_BREAKPOINTS,
  type KitComponent,
  type KitStore,
  kitBreakpoints,
} from '../../kit/index.ts';
import { elementIds, readSites } from '../../render/index.ts';
import { KitvasError, type TailwindTheme } from '../../shared/index.ts';
import { constantClass } from '../domain/expr/class-start.ts';
import { wrappedClass } from '../domain/list/item-class.ts';
import { listRoots, showsExpression, textSource } from '../domain/list/source.ts';
import { type ListView, listView } from '../domain/list/view.ts';
import {
  CLASS_NAME,
  ELEMENT_ID,
  fileOfId,
  hashOf,
  type PropValue,
  type StyleContext,
} from '../domain/ops.ts';
import { elementSpan } from '../domain/structure/subtree.ts';
import {
  IMAGE_FILE,
  MAX_IMAGES,
  readRule,
  type Shorthand,
  scssOverrides,
  varKindOf,
} from '../domain/style/apply-scss.ts';
import { newClassName } from '../domain/style/class-name.ts';
import { type SourceInput, styleSource, tokenGroupsOf } from '../domain/style/source.ts';
import { themeOrDefault, utilityOverrides } from '../domain/style/utilities.ts';
import { offsetOf, readTag } from '../domain/tsx/apply-tsx.ts';
import {
  type PropView,
  type Refusal,
  type RuleView,
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleSource,
  type TagView,
} from '../domain/types.ts';
import type { EditCompiler } from '../ports/compiler.ts';
import {
  catalogComponent,
  editKit,
  styleFormat,
  tokenOptions,
  versionTailwind,
} from './edit-state.ts';
import { type ItemScope, itemScoped } from './inspect-item.ts';
import { type InspectSource, lineAt, sourceOf } from './inspect-source.ts';
import { locateElement } from './locate.ts';
import { sectionScss } from './structure/section-files.ts';
import { movableAt } from './structure/structure.ts';
import { type Suggest, suggestFor } from './suggest/suggest.ts';

/** The file names in a version's `src/img` folder (`src/edit/adapters/image-files.ts`). */
export type ImageFiles = (slug: string, version: number) => readonly string[];

export type InspectDeps = {
  drafts: DraftStore;
  kits: KitStore;
  compiler: EditCompiler;
  /** The ETag of a file's text, as the studio's API writes it. */
  etag(text: string): string;
  /** The draft store cannot list a folder: without this the answer lists no images. */
  images?: ImageFiles | undefined;
};

type CatalogProp = {
  name: string;
  type: string;
  values?: string[];
  default?: string | number | boolean;
};

type InspectProp =
  | { name: string; kind: 'literal'; value: PropValue }
  | { name: string; kind: 'expr'; source: string };

/** The same shape as the studio's `InspectSchema` (`src/studio/api/edit/edit-schemas.ts`). */
export type InspectView = {
  id: string;
  version: number;
  file: string;
  etag: string;
  tag: string;
  component: { name: string; takesClassName: boolean; props: CatalogProp[] } | null;
  props: InspectProp[];
  spread: boolean;
  text: string | null;
  textRefusal: Refusal | null;
  className: { kind: 'string'; value: string } | { kind: 'expr'; source: string } | null;
  styleClass: { className: string; exists: boolean } | null;
  scss: {
    file: string;
    etag: string;
    rule: boolean;
    declarations: { property: string; value: string; offKit: boolean }[];
    nested: string[];
  } | null;
  styles: Record<StyleProperty, StyleSource>;
  /** `hashOf` the element's whole source (spec 4b, decision 5). */
  hash: string;
  /** Why it cannot be moved or deleted as an element; `null` when it can. */
  movable: Refusal | null;
  /** The 1-based line of the element's `<` in `file`. */
  line: number;
  /** The opening tag as one line, and where the element's class rule starts (plan 18f). */
  source: InspectSource;
  /** The image files of the version a background image may name, sorted. */
  images: string[];
  /** The kit's breakpoints, ascending (spec 4c, goal 1). */
  breakpoints: number[];
  /**
   * Plan 29: the project's Tailwind facts the element's classes were read with and are written by
   * (`versionTailwind`); `null` for an SCSS draft, or a Tailwind one whose build reported none.
   */
  tailwind: TailwindTheme | null;
  /**
   * Every value set for a width or a state: a context block of the class rule, or a prefixed
   * utility of a Tailwind draft (`utility`; `null` in SCSS). The base values are in `styles`.
   * `via`: the shorthand of the block that holds the value (ADR 0070).
   */
  overrides: {
    context: StyleContext;
    property: StyleProperty;
    value: string;
    offKit: boolean;
    utility: string | null;
    via?: Shorthand;
  }[];
  /**
   * Spec 4c, goal 9: the `.map` the element is rendered by; `null` when it is not in one. Asked
   * with a copy's path (ADR 0065), it is read for that copy: a list inside another one is the
   * array of the outer item the path names.
   */
  list: ListView | null;
  /** Spec 4d, goal 6: the kit component a plain element looks like; `null`: nothing to offer. */
  suggest: Suggest | null;
  /**
   * ADR 0060: the element may show text through `{…}` (its children are text and expressions, no
   * element, and an expression has an operand that is no element), so a double click asks
   * `textSourceOf`. `roots`: the ids of the root elements of the `.map` lists around it, outer
   * first, whose copies the frame counts; `null` when a list around it has no such root.
   * `null`: the element shows no such text.
   */
  expression: { roots: string[] | null } | null;
  /**
   * ADR 0072: asked with `scope: 'item'`, the copy's own class the view is read for, or why
   * there is none (`inspect-item.ts`); `null` when not asked.
   */
  itemScope: ItemScope | null;
};

/**
 * ADR 0060: an element that shows text through `{…}`, with the ids of the list roots around it.
 * Their ids come from the text compiled as the build compiles it, as `locateElement` finds one.
 */
async function expressionOf(
  compiler: EditCompiler,
  text: string,
  file: string,
  at: number,
): Promise<InspectView['expression']> {
  if (!showsExpression(text, at)) return null;
  const roots = listRoots(text, at);
  if (roots === null) return { roots: null };
  if (roots.length === 0) return { roots: [] };
  const code = await compiler.jsxDev(text, file);
  const sites = code === null ? undefined : readSites(code);
  if (sites === undefined) return { roots: null };
  const ids = new Map(
    elementIds(file, sites).map((entry) => [offsetOf(text, entry.line, entry.column), entry.id]),
  );
  const named = roots.flatMap((root) => {
    const id = ids.get(root);
    // An id the API could not carry (`ElementIdSchema`) names no root the frame could count.
    return id !== undefined && id.length <= 200 && ELEMENT_ID.test(id) ? [id] : [];
  });
  return { roots: named.length === roots.length ? named : null };
}

/** The names a style may write as `url(../img/<file>)`: others are left out, never escaped. */
const imageNames = (names: readonly string[]): string[] =>
  names
    .filter((name) => IMAGE_FILE.test(name))
    .sort()
    .slice(0, MAX_IMAGES);

/** A part such as `Card.Header` takes none of the root's catalog props (`Card`'s `padding`). */
const isPart = (tag: string): boolean => tag.includes('.');

const catalogProps = (component: KitComponent): CatalogProp[] =>
  component.props.map((prop) => ({
    name: prop.name,
    type: prop.type,
    ...(prop.values === undefined ? {} : { values: prop.values }),
    ...(prop.default === undefined ? {} : { default: prop.default }),
  }));

function propOut(prop: PropView): InspectProp {
  return prop.kind === 'literal'
    ? { name: prop.name, kind: 'literal', value: prop.value }
    : { name: prop.name, kind: 'expr', source: prop.source };
}

export { classNameOf } from '../domain/style/class-name.ts';

const CLASS_ATTRIBUTE = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
const QUOTED = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

/** Every class the TSX names in a `className`, also inside strings of a `className={…}`. */
function tsxClasses(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(CLASS_ATTRIBUTE)) {
    const inner = match[3];
    const chunks =
      inner === undefined
        ? [match[1] ?? match[2] ?? '']
        : [...inner.matchAll(QUOTED)].map((quoted) => quoted[1] ?? quoted[2] ?? quoted[3] ?? '');
    for (const chunk of chunks) {
      for (const name of chunk.split(/\s+/)) {
        if (name !== '') found.add(name);
      }
    }
  }
  return found;
}

const splitClasses = (value: string): string[] => value.split(/\s+/).filter((name) => name !== '');

/** The classes of a string `className`; none for an expression or no `className`. */
export const classesOf = (tag: TagView): string[] =>
  tag.className?.kind === 'string' ? splitClasses(tag.className.value) : [];

/**
 * The class a style edit writes (decision 3): the first class with a rule in the section SCSS,
 * else the first class, else a new one named after the section (`newClassName`; `exists: false`:
 * the edit adds it first). A `className` built in code gives the class every one of its values
 * starts with (ADR 0060, `constantClass`). `null` when no class can carry a style: a kit
 * component without `className`, a `className` built in code without such a class, or only
 * classes kitvas cannot write. `file`: the TSX file of the element, which names the block of a
 * new class when the section's root has no class.
 */
export function pickStyleClass(
  tag: TagView,
  component: KitComponent | null,
  tsx: string,
  scss: string | undefined,
  file: string,
): { className: string; exists: boolean } | null {
  if (component !== null && !component.styling.includes('className')) return null;
  if (tag.className?.kind === 'expr') {
    // ADR 0072: "This item" wraps an expression as `` `${…} card--${plan.id}` ``.
    const { source } = tag.className;
    const constant = constantClass(source) ?? wrappedClass(source);
    return constant === null ? null : { className: constant, exists: true };
  }
  const classes = classesOf(tag);
  const writable = classes.filter((name) => CLASS_NAME.test(name));
  const ruled =
    scss === undefined ? undefined : writable.find((name) => readRule(scss, name) !== null);
  const first = ruled ?? writable[0];
  if (first !== undefined) return { className: first, exists: true };
  if (classes.length > 0) return null;
  const className = newClassName({
    tag: tag.name,
    tsx,
    at: tag.span.start,
    file,
    scss: scss ?? '',
    taken: tsxClasses(tsx),
  });
  return { className, exists: false };
}

function classNameOut(tag: TagView): InspectView['className'] {
  if (tag.className === null) return null;
  return tag.className.kind === 'string'
    ? { kind: 'string', value: tag.className.value }
    : { kind: 'expr', source: tag.className.source };
}

/**
 * The element `id` in the latest version. Throws EDIT_ELEMENT_NOT_FOUND when it is not there.
 * `path`: the rendered copy its `list` is read for (its place in each list around it). `scope:
 * 'item'`: read for that copy's own class (ADR 0072, `itemScope`).
 */
export async function inspectElement(
  deps: InspectDeps,
  slug: string,
  id: string,
  path?: readonly number[],
  scope?: 'item',
): Promise<InspectView> {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const file = fileOfId(id);
  const missing = () => new KitvasError('EDIT_ELEMENT_NOT_FOUND', { slug, version, id });
  const text = deps.drafts.readText(slug, `${base}/${file}`);
  if (text === undefined) throw missing();
  // Found again in the current text every time: Claude may have changed the file since the build.
  const at = await locateElement(deps.compiler, text, file, id);
  if (typeof at !== 'number') throw missing();
  const tag = readTag(text, at);
  if (typeof tag === 'string') throw missing();

  const kit = editKit(deps.kits, draft.kit.id);
  const component = catalogComponent(kit, tag.name);
  const catalog = component === null || isPart(tag.name) ? null : catalogProps(component);
  const scssFile = sectionScss(deps.drafts, slug, version, file);
  const scssText =
    scssFile === null ? undefined : deps.drafts.readText(slug, `${base}/${scssFile}`);
  const styleClass = pickStyleClass(tag, component, text, scssText, file);
  const read =
    styleClass === null || scssText === undefined ? null : readRule(scssText, styleClass.className);
  const rule: RuleView | null = read === null || read === 'ambiguous' ? null : read;
  // `className` has a field of its own; the props are the ones a prop control edits.
  const props = tag.props.filter((prop) => prop.name !== 'className');

  const format = styleFormat(kit);
  const tailwind = format === 'tailwind' ? versionTailwind(deps.drafts, slug, version) : null;
  const theme = themeOrDefault(tailwind);
  const tokens = tokenOptions(kit, tailwind);
  const tokenGroups = tokenGroupsOf(tokens);
  const input: Omit<SourceInput, 'property'> = {
    component: catalog === null ? null : { props: catalog },
    written: props.map((prop) => prop.name),
    rule,
    classes: classesOf(tag),
    format,
    tailwind: theme,
    tokenGroups,
  };
  // The values of the widths and states: prefixed utilities, or the rule's context blocks, read
  // with the token types the base is read with, so a shorthand splits the same in both.
  const overrides: InspectView['overrides'] =
    format === 'tailwind'
      ? utilityOverrides(classesOf(tag), tokens, theme)
      : rule === null || scssText === undefined
        ? []
        : scssOverrides(scssText, rule.className, varKindOf(tokenGroups)).map((each) => ({
            ...each,
            utility: null,
          }));
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, styleSource({ ...input, property })]),
  ) as Record<StyleProperty, StyleSource>;
  // The whole subtree, as a structural op names it (spec 4b, decision 5).
  const span = elementSpan(text, at);

  const view: InspectView = {
    id,
    version,
    file,
    etag: deps.etag(text),
    tag: tag.name,
    component:
      component === null
        ? null
        : {
            name: component.name,
            takesClassName: component.styling.includes('className'),
            props: catalog ?? [],
          },
    props: props.map(propOut),
    spread: tag.spread,
    text: tag.text?.value ?? null,
    textRefusal: tag.text === null ? 'no-text' : null,
    className: classNameOut(tag),
    styleClass,
    scss:
      scssFile === null || scssText === undefined
        ? null
        : {
            file: scssFile,
            etag: deps.etag(scssText),
            rule: read !== null,
            declarations: (rule?.declarations ?? []).map(({ property, value, offKit }) => ({
              property,
              value,
              offKit,
            })),
            nested: rule?.nested ?? [],
          },
    styles,
    // An element whose end the reader cannot find is not offered for a move: its hash would match
    // nothing a structural op could check.
    hash: hashOf(span === null ? '' : text.slice(span.start, span.end)),
    movable: span === null ? 'not-found' : movableAt(text, at),
    line: lineAt(text, at),
    // The rule of a class the element has; a new class (`exists: false`) has none yet.
    source: sourceOf({
      tsx: text,
      tag: tag.span,
      scssFile,
      scss: scssText,
      className: styleClass?.exists === true ? styleClass.className : null,
    }),
    images: imageNames(deps.images?.(slug, version) ?? []),
    breakpoints: kit === null ? [...DEFAULT_BREAKPOINTS] : kitBreakpoints(kit.kit),
    tailwind,
    overrides,
    list: listView(text, at, path),
    suggest: suggestFor({
      text,
      at,
      view: tag,
      own: component,
      catalog: kit?.kit.components ?? [],
      format,
      properties: (rule?.declarations ?? []).map((declaration) => declaration.property),
      classes: classesOf(tag),
    }),
    expression: await expressionOf(deps.compiler, text, file, at),
    itemScope: null,
  };
  if (scope !== 'item') return view;
  return itemScoped(view, { text, at, path, format, scss: scssText, input });
}

/**
 * ADR 0060: why the text `shown` of the element `id`, in the copy at `path` (its place in each
 * list around it, outer first), has no one string literal of its file behind it in the latest
 * version; `null` when it has one, so a double click may open the inline editor. Reads only.
 */
export async function textSourceOf(
  deps: Pick<InspectDeps, 'drafts' | 'compiler'>,
  slug: string,
  id: string,
  shown: string,
  path: readonly number[],
): Promise<Refusal | null> {
  const base = versionFolder(latestVersion(loadDraft(deps.drafts, slug)));
  const file = fileOfId(id);
  const text = deps.drafts.readText(slug, `${base}/${file}`);
  if (text === undefined) return 'not-found';
  const at = await locateElement(deps.compiler, text, file, id);
  if (typeof at !== 'number') return at;
  const found = textSource(text, at, shown, path);
  return 'refused' in found ? found.refused : null;
}
