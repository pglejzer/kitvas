// Use case: `kitvas kit exports`. The component names the source of an npm or repo kit exports, and
// which of them the kit has (ADR 0081). The names come from the bundler, which bundles a probe that
// re-exports the source; no code of the package runs in Node, nothing is installed or written.

import { join, sep } from 'node:path';
import {
  type KitStore,
  type ProjectSetup,
  parseKitResolve,
  parseKitSource,
} from '../../kit/index.ts';
import type { Bundler } from '../../render/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { type ExportsSplit, isSourceModule, splitExports } from '../domain/kit/exports.ts';
import { buildErrorText } from './verify/step.ts';

export type ExportsDeps = {
  kits: KitStore;
  bundler: Bundler;
  /** The disk of a project: the installed package, the files of the repo folder. */
  projectFiles(project: string): ProjectSetup;
};

/** The source of a kit that has a package or a folder to list, as its kit.json says. */
export type ExportsSource =
  | { type: 'npm'; package: string; version: string }
  | { type: 'repo'; path: string };

export type KitExports = { id: string; source: ExportsSource } & ExportsSplit;

const invalid = (detail: string): KitvasError => new KitvasError('KIT_SOURCE_INVALID', { detail });

/** The entry of an installed package. */
function packageModules(disk: ProjectSetup, name: string): string[] {
  if (disk.packageVersion(name) === undefined) {
    throw new KitvasError('KIT_PACKAGE_MISSING', { name });
  }
  return [name];
}

/** Every script of the folder, as an absolute path with forward slashes. */
function folderModules(disk: ProjectSetup, project: string, path: string): string[] {
  if (!disk.exists(path)) throw invalid(`"${path}" does not exist`);
  return disk
    .listFiles(path)
    .filter(isSourceModule)
    .map((file) =>
      join(project, ...path.split('/'), ...file.split('/'))
        .split(sep)
        .join('/'),
    );
}

/**
 * Lists the exports of kit `id`'s source. Only the source and the names of kit.json are read, so a
 * kit just made by `kit new` can be listed. A kit that is not there throws `KIT_NOT_FOUND`; a
 * written or built-in kit, a missing folder or a source that does not bundle `KIT_SOURCE_INVALID`
 * (the last with the first build error); a package that is not installed `KIT_PACKAGE_MISSING`.
 */
export async function kitExports(deps: ExportsDeps, id: string): Promise<KitExports> {
  const files = deps.kits.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
  const source = parseKitSource(files.kitJson, id);
  if (source.type !== 'npm' && source.type !== 'repo') {
    throw invalid(`kit "${id}" has no package or folder to list; its source is ${source.type}`);
  }
  const { project } = files;
  if (project === undefined) throw invalid(`kit "${id}" is not a kit of this project`);

  const disk = deps.projectFiles(project);
  const modules =
    source.type === 'npm'
      ? packageModules(disk, source.package)
      : folderModules(disk, project, source.path);
  const read = await deps.bundler.exportNames({
    workingDir: project,
    modules,
    project,
    resolve: parseKitResolve(files.kitJson),
  });
  const first = read.errors[0];
  if (first !== undefined) throw invalid(buildErrorText(first));
  return { id, source, ...splitExports(read.names, files.kitJson) };
}
