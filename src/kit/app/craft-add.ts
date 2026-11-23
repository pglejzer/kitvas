// Use cases: take the picked final of a craft draft into the project's additions layer (ADR 0046),
// or write its files to a folder. The draft is read through `deps.picked`, so the kit module stays
// free of the drafts module.

import { KitvasError, type Translate } from '../../shared/index.ts';
import { CATEGORIES, type KitComponent } from '../domain/contract.ts';

type KitCategory = (typeof CATEGORIES)[number];

import type { KitWriter } from '../ports/kit-writer.ts';

/** The picked sketch of a craft draft, as `pickedFinal` of the drafts module answers it. */
export type CraftPicked = {
  kit: string;
  subject: 'component' | 'icon' | 'logo';
  name: string;
  description: string;
  text: string;
};

export type CraftDeps = {
  writer: KitWriter;
  /** Throws DRAFT_KIND for a draft that is not craft, SKETCH_UNKNOWN when nothing is picked. */
  picked(slug: string): CraftPicked;
  t: Translate;
};

export type CraftAdded = { kit: string; name: string; files: string[] };

type Prop = KitComponent['props'][number];
type PropType = Prop['type'];

const invalid = (name: string): KitvasError =>
  new KitvasError('ADDITION_INVALID', { name, detail: 'export' });

/** The first exported component of a sketch file. */
const EXPORTED = /export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/;

/** The sketch with its component renamed to `name`, as a named export. */
export function renameExport(text: string, name: string): string {
  const old = EXPORTED.exec(text)?.[1];
  if (old === undefined) throw invalid(name);
  const renamed = old === name ? text : text.replace(new RegExp(`\\b${old}\\b`, 'g'), name);
  return renamed.replace(/export\s+default\s+(function|const)\s/, 'export $1 ');
}

function propType(type: string): Pick<Prop, 'type' | 'values'> {
  const literals = /^(?:(?:'[^']*'|"[^"]*")\s*\|\s*)*(?:'[^']*'|"[^"]*")$/.test(type);
  if (literals) {
    const values = [...type.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '');
    return { type: 'enum', values };
  }
  const simple: Record<string, PropType> = {
    boolean: 'boolean',
    string: 'string',
    number: 'number',
    ReactNode: 'node',
    'React.ReactNode': 'node',
    ReactElement: 'element',
    'React.ReactElement': 'element',
  };
  const known = simple[type];
  if (known) return { type: known };
  return { type: type.includes('=>') ? 'callback' : 'object' };
}

/** The members of the exported props type (`interface XProps { … }` or `type XProps = { … }`). */
export function propsOf(text: string): Prop[] {
  const body = /(?:interface\s+\w*Props[^{]*|type\s+\w*Props\s*=\s*)\{([^}]*)\}/.exec(text)?.[1];
  if (body === undefined) return [];
  const members = body.matchAll(/^\s*([A-Za-z_]\w*)(\?)?\s*:\s*([^;,\n]+?)\s*[;,]?\s*$/gm);
  return [...members].map((member) => ({
    name: member[1] ?? '',
    ...propType((member[3] ?? '').trim()),
    ...(member[2] === undefined ? { required: true } : {}),
  }));
}

/** Props of an icon or a logo are fixed, whatever the sketch declares. */
function fixedProps(subject: CraftPicked['subject']): Prop[] {
  const size: Prop = { name: 'size', type: 'number', default: subject === 'icon' ? 24 : 32 };
  const title: Prop = { name: 'title', type: 'string' };
  if (subject === 'icon') return [size, title];
  const tone: Prop = { name: 'tone', type: 'enum', values: ['colour', 'mono'], default: 'colour' };
  return [size, title, tone];
}

/** One example: icons and logos by their fixed props, a component with its required props filled. */
function exampleOf(name: string, subject: CraftPicked['subject'], props: Prop[]): string {
  if (subject === 'icon') return `<${name} size={24} />`;
  if (subject === 'logo') return `<${name} size={32} tone="mono" />`;
  const attrs = props.flatMap((prop) => {
    if (prop.required !== true) return [];
    if (prop.type === 'enum' && prop.values?.[0] !== undefined)
      return [`${prop.name}="${prop.values[0]}"`];
    if (prop.type === 'string') return [`${prop.name}="Text"`];
    if (prop.type === 'number') return [`${prop.name}={1}`];
    return [];
  });
  return `<${name}${attrs.map((attr) => ` ${attr}`).join('')} />`;
}

/** `--category`: one of the kit contract's categories; display when absent. */
export function categoryOf(value: string | undefined): KitCategory {
  if (value === undefined) return 'display';
  const found = CATEGORIES.find((category) => category === value);
  if (found === undefined) throw new KitvasError('USAGE', { detail: `--category ${value}` });
  return found;
}

/** The catalog entry of the final, in the kit contract's component shape. */
export function craftEntry(final: CraftPicked, chosen: KitCategory = 'display'): KitComponent {
  const { name, subject } = final;
  const category: KitCategory =
    subject === 'icon' ? 'icon' : subject === 'logo' ? 'display' : chosen;
  const props = subject === 'component' ? propsOf(final.text) : fixedProps(subject);
  return {
    name,
    category,
    description: final.description,
    import: { from: `components/${name}`, name },
    parts: [],
    styling: [],
    props,
    state: [],
    examples: [{ title: 'Default', code: exampleOf(name, subject, props), imports: [name] }],
    a11y: [],
    deprecated: false,
  };
}

/** The final's component file, named by the craft draft. */
const componentFile = (final: CraftPicked): { path: string; text: string } => ({
  path: `components/${final.name}.tsx`,
  text: renameExport(final.text, final.name),
});

/**
 * Adds the final to the project's additions of the draft's kit. A name the kit already has is
 * `ADDITION_EXISTS`; `replace` overwrites an earlier addition only (the writer decides).
 */
export function addCraft(
  deps: CraftDeps,
  slug: string,
  options: { replace: boolean; category?: string | undefined },
): CraftAdded {
  const final = deps.picked(slug);
  const file = componentFile(final);
  const category = categoryOf(options.category);
  deps.writer.writeAddition(final.kit, craftEntry(final, category), [file], options.replace);
  return { kit: final.kit, name: final.name, files: [file.path] };
}

/** Writes the final's component file and a short README into `dir`. */
export function exportCraft(deps: CraftDeps, slug: string, dir: string): { files: string[] } {
  const final = deps.picked(slug);
  const component = componentFile(final);
  const file = { path: `${final.name}.tsx`, text: component.text };
  const readme = {
    path: 'README.md',
    text: deps.t('craft.export.readme', {
      name: final.name,
      description: final.description,
      file: file.path,
    }),
  };
  deps.writer.exportFiles(dir, [file, readme]);
  return { files: [file.path, readme.path] };
}
