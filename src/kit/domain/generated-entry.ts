// The entry file of a project kit, written by kitvas from the catalog (never by the learner): one
// import per global style file, then one re-export per component, then one per addition of the
// project (C7). A built-in kit with additions gets the same file in its additions folder. Every
// string from kit.json is quoted with JSON.stringify; names are written bare only when they match
// a strict pattern.

import { isAdditionImport } from './additions.ts';
import type { Kit, KitComponent } from './contract.ts';
import { componentKind, IDENTIFIER, styleKind, type TargetKind } from './sources.ts';

export const GENERATED_ENTRY = 'generated/kit.ts';

/** From `<project>/.kitvas/kits/<id>/generated/` back up to the project folder. */
const TO_PROJECT = '../../../../';

const HEADER =
  '// Written by kitvas from kit.json; do not edit. "kitvas kit verify" writes it again.';

/** From `generated/` up one folder, to the kit's own `components/`. */
const TO_KIT = '../';

function quoted(from: string, kind: TargetKind): string {
  if (kind === 'project') return JSON.stringify(`${TO_PROJECT}${from}`);
  return JSON.stringify(kind === 'kit' ? `${TO_KIT}${from}` : from);
}

/** The inside of `export { … }` that gives the component its catalog name. */
function exportClause(component: KitComponent): string {
  const { name } = component;
  if (component.import.default === true) return `default as ${name}`;
  const own = component.import.name ?? name;
  if (own === name) return name;
  // A name that is not an identifier is still a valid export name as a string (ES2022).
  return `${IDENTIFIER.test(own) ? own : JSON.stringify(own)} as ${name}`;
}

/** The project's additions an entry re-exports after the kit's own components (C7). */
export type EntryAdditions = {
  /** Names of the kit's components that come from its additions, not from kit.json. */
  names: readonly string[];
  /** The kit's additions folder as an import path from the entry's folder, ending in `/`. */
  dir: string;
  /**
   * For a built-in kit: its own entry, absolute with forward slashes. The entry then re-exports all
   * of it (`export *`) in place of style imports and component lines, since only kitvas's
   * folder holds the kit and kitvas writes nothing there.
   */
  base?: string | undefined;
};

/**
 * The entry of a project kit, or of a built-in kit with additions. Line 1 says it is generated.
 * Then one `import "<style>";` per `runtime.styles.imports` entry: global styles come first, as in
 * an app's own entry, so the components' styles follow them in the bundle's CSS. Then one
 * `export { <import.name or default as Name> } from "<from>";` per component in catalog order.
 * A package specifier is written as it is; a project path is made relative to the kit's
 * `generated/` folder ("../../../../<path>"). Imports that do not fit the kit's source and repeated
 * component names are left out (the source rules report them). The additions come last, each from
 * its own file under `additions.dir`, so a package is never touched. `lines[componentName]` is
 * that component's 1-based line.
 */
export function generatedEntry(
  kit: Kit,
  additions?: EntryAdditions,
): { text: string; lines: Record<string, number> } {
  const out = [HEADER];
  const added = new Set(additions?.names ?? []);
  if (additions?.base !== undefined) {
    out.push(`export * from ${JSON.stringify(additions.base)};`);
  } else {
    for (const from of kit.runtime.styles.imports) {
      const kind = styleKind(kit, from);
      if (kind !== undefined) out.push(`import ${quoted(from, kind)};`);
    }
  }
  const lines: Record<string, number> = {};
  for (const component of kit.components) {
    if (added.has(component.name)) continue;
    const kind = componentKind(kit, component.import.from);
    if (kind === undefined || Object.hasOwn(lines, component.name)) continue;
    out.push(`export { ${exportClause(component)} } from ${quoted(component.import.from, kind)};`);
    lines[component.name] = out.length;
  }
  for (const component of kit.components) {
    const { from } = component.import;
    if (!added.has(component.name) || Object.hasOwn(lines, component.name)) continue;
    if (additions === undefined || !isAdditionImport(from)) continue;
    out.push(
      `export { ${exportClause(component)} } from ${JSON.stringify(`${additions.dir}${from}`)};`,
    );
    lines[component.name] = out.length;
  }
  return { text: `${out.join('\n')}\n`, lines };
}
