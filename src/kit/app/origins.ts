// Use cases: the record of where each component of a `code` kit came from (C9), and the components
// whose project files have changed since.

import { createHash } from 'node:crypto';
import type { KitComponent } from '../domain/contract.ts';
import {
  type NowHashes,
  nextOrigins,
  normalizeLineEnds,
  ORIGINS_FILE,
  type OutdatedComponent,
  outdatedOf,
  parseOrigins,
} from '../domain/origins.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import type { ProjectFiles, ProjectSetup } from '../ports/project-files.ts';
import { loadKit, ownKit } from './load-kit.ts';

export type OriginsDeps = {
  kits: KitStore;
  /** Reads and writes `origins.json` in the kit folder. */
  kitWriter: Pick<KitWriter, 'readText' | 'writeText'>;
  /** The project's files and installed packages. */
  files: Pick<ProjectSetup, 'readBytes'> & Pick<ProjectFiles, 'packageVersion'>;
};

const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The hash of what the project has for a component now; `undefined` when a file or package is missing. */
function projectHash(
  files: OriginsDeps['files'],
  project: KitComponent['project'],
): string | undefined {
  if (project === undefined) return undefined;
  if (project.package !== undefined) {
    const version = files.packageVersion(project.package);
    return version === undefined ? undefined : sha256([project.package, version]);
  }
  const texts: string[] = [];
  for (const path of [...(project.files ?? []), ...project.styles]) {
    const bytes = files.readBytes(path);
    if (bytes === undefined) return undefined;
    texts.push(normalizeLineEnds(new TextDecoder().decode(bytes)));
  }
  return sha256(texts);
}

/** The hash of the component's entry in kit.json, its two files and its originals. */
function copyHash(
  component: KitComponent,
  components: Record<string, string>,
  originals: Record<string, string>,
): string {
  const { name } = component;
  return sha256([
    component,
    components[`components/${name}.tsx`] ?? null,
    components[`components/${name}.module.css`] ?? null,
    ...component.examples.map((example) =>
      example.original === undefined ? null : (originals[example.original] ?? null),
    ),
  ]);
}

/** What the kit's components with a `project` hash to now, in the kit's order. */
function nowHashes(deps: OriginsDeps, id: string): NowHashes[] {
  const kit = ownKit(loadKit(deps.kits, id));
  const components = deps.kits.readTree?.(id, 'components') ?? {};
  const originals = deps.kits.readTree?.(id, 'originals') ?? {};
  return kit.components
    .filter((component) => component.project !== undefined)
    .map((component) => ({
      name: component.name,
      project: projectHash(deps.files, component.project),
      copy: copyHash(component, components, originals),
    }));
}

/**
 * Records, in `origins.json`, the components with a `project` that have no record, whose copy
 * changed since the record, or that `current` names; any other record is left, and a record of a
 * component the kit no longer has is dropped. Writes only when the file would change. Returns the
 * names recorded.
 */
export function recordOrigins(
  deps: OriginsDeps,
  id: string,
  options: { current: readonly string[] },
): string[] {
  const text = deps.kitWriter.readText(id, ORIGINS_FILE);
  const before = parseOrigins(text);
  const after = nextOrigins(before, nowHashes(deps, id), options.current);
  const recorded = Object.keys(after.components).filter(
    (name) => JSON.stringify(after.components[name]) !== JSON.stringify(before.components[name]),
  );
  const empty = Object.keys(after.components).length === 0;
  const body = `${JSON.stringify(after, null, 2)}\n`;
  if (!(empty && text === undefined) && body !== text) {
    deps.kitWriter.writeText(id, ORIGINS_FILE, body);
  }
  return recorded;
}

/** The recorded components whose project files differ now (`gone` when a file is missing). */
export function outdatedComponents(deps: OriginsDeps, id: string): OutdatedComponent[] {
  const before = parseOrigins(deps.kitWriter.readText(id, ORIGINS_FILE));
  if (Object.keys(before.components).length === 0) return [];
  return outdatedOf(before, nowHashes(deps, id));
}
