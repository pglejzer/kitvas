// The project's additions to a kit (C7, ADR 0046): components kitvas crafted for the project, kept
// in `.kitvas/additions/<kit id>/` beside the kit and merged after the kit's own components. They
// work for every kit source; a package or the person's source is never written to.

import { type Zod, z } from '../../shared/index.ts';
import { KIT_PATH, type Kit, type KitComponent, KitSchema } from './contract.ts';
import type { KitIssue } from './issues.ts';

/** The project's additions folder, in its `.kitvas/`. */
export const ADDITIONS_DIR = 'additions';
/** The catalog of one kit's additions, in `.kitvas/additions/<kit id>/`. */
export const ADDITIONS_FILE = 'additions.json';
/** The folder of an addition's files, inside its kit's additions folder. */
export const ADDITION_FILES = 'components';

/** One addition: a component in the kit contract's shape. */
export const AdditionSchema = KitSchema.shape.components.element;

export const AdditionsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  components: z.array(AdditionSchema),
});

export type Additions = Zod.infer<typeof AdditionsSchema>;

/** What `additions.json` holds before anything was added. */
export const NO_ADDITIONS: Additions = { schemaVersion: 1, components: [] };

/**
 * What an addition's `import.from` may name: a script of its own `components/` folder, from the
 * kit's additions folder (`components/StarIcon`), never a package, a project path or a style.
 */
export const isAdditionImport = (from: string): boolean =>
  KIT_PATH.test(from) && !from.endsWith('.css');

/** Where the schema refuses raw JSON: `components.0.category`, or the file itself. */
function refusedAt(issues: readonly { readonly path: readonly PropertyKey[] }[]): string {
  const path = issues[0]?.path.map(String).join('.') ?? '';
  return path === '' ? ADDITIONS_FILE : path;
}

/** Raw `additions.json`: the additions, or the place the schema refuses. */
export function parseAdditions(raw: unknown): { additions: Additions } | { at: string } {
  const parsed = AdditionsSchema.safeParse(raw);
  return parsed.success ? { additions: parsed.data } : { at: refusedAt(parsed.error.issues) };
}

/** One addition as given to the writer, checked: the addition, or the place the schema refuses. */
export function parseAddition(raw: unknown): { component: KitComponent } | { at: string } {
  const parsed = AdditionSchema.safeParse(raw);
  if (!parsed.success) return { at: refusedAt(parsed.error.issues) };
  if (!isAdditionImport(parsed.data.import.from)) return { at: 'import.from' };
  return { component: parsed.data };
}

export type MergedKit = {
  /** The kit with the additions after its own components. */
  kit: Kit;
  /** Names of the merged additions, in catalog order. */
  additions: string[];
  /** Additions that were left out, and why. */
  issues: KitIssue[];
};

/**
 * Appends the additions after the kit's own components. A name the kit has, or an earlier addition
 * has, is an issue and is left out, never merged over it; so is an addition whose import does not
 * name its own file.
 */
export function mergeAdditions(kit: Kit, additions: Additions): MergedKit {
  const taken = new Set(kit.components.map((component) => component.name));
  const merged: KitComponent[] = [];
  const issues: KitIssue[] = [];
  for (const component of additions.components) {
    const { name } = component;
    const at = `additions.${name}`;
    if (taken.has(name)) {
      issues.push({ path: at, key: 'kitIssue.additionExists', params: { kit: kit.id, name } });
      continue;
    }
    if (!isAdditionImport(component.import.from)) {
      issues.push({
        path: `${at}.import.from`,
        key: 'kitIssue.additionImport',
        params: { component: name, from: component.import.from },
      });
      continue;
    }
    taken.add(name);
    merged.push(component);
  }
  return {
    kit: { ...kit, components: [...kit.components, ...merged] },
    additions: merged.map((component) => component.name),
    issues,
  };
}
