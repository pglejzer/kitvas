// Step `imports`: the kit's entry bundles, and every component is exported by the module kit.json
// names for it.
//
// The entry is bundled through a probe that imports it and then every component straight from its
// own module, each on its own line. The probe is needed because the generated entry only
// re-exports, and esbuild takes a missing name in a TypeScript re-export for a type and says
// nothing; a name the probe imports and uses is an error at the probe's line.

import { join, sep } from 'node:path';
import { isWrittenKit, type Kit, type KitComponent, type LoadedKit } from '../../../kit/index.ts';
import type { Bundler } from '../../../render/index.ts';
import type { VerifyIssue } from '../../domain/kit-verify.ts';
import { componentAtEntryLine, entryFile, isEntryFile } from './kit-entry.ts';
import { buildErrorText, ran, type StepResult, toolIssue } from './step.ts';

/** The probe's name in esbuild's messages. */
export const IMPORT_PROBE = 'kitvas-imports.ts';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** esbuild: `No matching export in "<file>" for import "<name>"`. */
const NO_EXPORT = /^No matching export in /;

export type ImportProbe = {
  source: string;
  /** 1-based line of the probe to the index of the component it imports. */
  lines: Record<number, number>;
};

/** The name a component has in its module: `default`, `import.name`, or its own name. */
export const importedName = (component: KitComponent): string =>
  component.import.default === true ? 'default' : (component.import.name ?? component.name);

/**
 * `project` is the folder of a repo kit, whose components are imported by paths from the
 * project's root; `kitDir` is the folder of a written kit, whose components are its own
 * `components/` files. Both are written absolute, which esbuild takes with forward slashes.
 */
export function importProbe(kit: Kit, project: string | undefined, kitDir?: string): ImportProbe {
  const source = ['import "@kit";'];
  const lines: Record<number, number> = {};
  for (const [index, component] of kit.components.entries()) {
    const root = kit.source.type === 'repo' ? project : isWrittenKit(kit) ? kitDir : undefined;
    const from =
      root !== undefined
        ? join(root, ...component.import.from.split('/'))
            .split(sep)
            .join('/')
        : component.import.from;
    const name = importedName(component);
    // A name that is no identifier is written as a string, which the module syntax allows.
    const binding =
      name === 'default'
        ? `K${index}`
        : `{ ${IDENTIFIER.test(name) ? name : JSON.stringify(name)} as K${index} }`;
    source.push(`import ${binding} from ${JSON.stringify(from)};`);
    lines[source.length] = index;
  }
  // Used, so that the imports are not dropped as types.
  source.push(
    `export const kitvasImports = [${kit.components.map((_, i) => `K${i}`).join(', ')}];`,
  );
  source.push('');
  return { source: source.join('\n'), lines };
}

export type ImportsInput = {
  loaded: LoadedKit;
  /** The kit's catalog folder; esbuild works there, so file names in its messages start from it. */
  dir: string;
  bundler: Bundler;
};

export async function importsStep({ loaded, dir, bundler }: ImportsInput): Promise<StepResult> {
  const { kit } = loaded;
  const probe = importProbe(kit, loaded.project, loaded.dir);
  const bundle = await bundler.bundle({
    workingDir: dir,
    entry: { name: IMPORT_PROBE, source: probe.source },
    alias: { '@kit': entryFile(loaded) },
    ids: {},
    project: loaded.project,
  });

  const issues: VerifyIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: VerifyIssue): void => {
    // The entry and the probe import the same modules, so one problem can come twice.
    const id = JSON.stringify([issue.path, issue.key, issue.params]);
    if (!seen.has(id)) issues.push(issue);
    seen.add(id);
  };

  for (const error of bundle.errors) {
    // The name alone, or at the end of a path when the tools went through a link.
    const inProbe = error.file === IMPORT_PROBE || error.file.endsWith(`/${IMPORT_PROBE}`);
    const index = inProbe
      ? probe.lines[error.line]
      : isEntryFile(loaded, dir, error.file)
        ? componentAtEntryLine(loaded, error.line)
        : undefined;
    const component = index === undefined ? undefined : kit.components[index];
    if (!component) {
      add(toolIssue('imports', 'runtime.entry', inProbe ? error.message : buildErrorText(error)));
    } else if (NO_EXPORT.test(error.message)) {
      add({
        step: 'imports',
        path: `components.${index}.import`,
        key: 'kitIssue.exportMissing',
        params: { name: importedName(component), from: component.import.from },
      });
    } else {
      add(toolIssue('imports', `components.${index}.import`, error.message));
    }
  }
  return ran(issues);
}
