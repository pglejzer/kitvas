// Use case: `kit new`, the skeleton of a project kit that the learner agent then fills.

import { join } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import { type Kit, KitSchema, type KitSource, PROJECT_PATH } from '../domain/contract.ts';
import { GENERATED_ENTRY, generatedEntry } from '../domain/generated-entry.ts';
import { isPackageSpecifier, majorVersion, packageOf, type SourceFlag } from '../domain/sources.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import type { ProjectSetup } from '../ports/project-files.ts';
import {
  copyImages,
  type ImagePlan,
  resolveWrittenSource,
  type SkippedImage,
} from './new-written-kit.ts';

export type NewKitDeps = {
  /** Both layers: an id taken by a built-in or a project kit is refused. */
  kits: KitStore;
  kitWriter: KitWriter;
  files: ProjectSetup;
  /** The project's kit folder, `<project>/.kitvas/kits`. */
  kitsDir: string;
};

type ProjectSource = Exclude<KitSource, { type: 'builtin' }>;

export type NewKit = {
  id: string;
  path: string;
  source: ProjectSource;
  /** Screenshots of an `images` source that were not copied; [] for every other source. */
  skipped: SkippedImage[];
};

/** The where of KIT_EXISTS for a kit that ships with kitvas. */
const BUILT_IN = 'built-in';

function refuseTaken(deps: NewKitDeps, id: string): void {
  if (!deps.kits.exists(id, 'kit.json')) return;
  let where = join(deps.kitsDir, id);
  try {
    const files = deps.kits.read(id);
    if (files) where = files.project === undefined ? BUILT_IN : files.dir;
  } catch (error) {
    // A kit.json that is not JSON: only a project folder can hold one, and `where` says so already.
    if (!(error instanceof KitvasError)) throw error;
  }
  throw new KitvasError('KIT_EXISTS', { id, where });
}

type ProjectFlag = SourceFlag & { type: 'npm' | 'repo' };

function resolveSource(files: ProjectSetup, from: ProjectFlag): ProjectSource {
  if (from.type === 'npm') {
    if (!isPackageSpecifier(from.value)) {
      throw new KitvasError('KIT_SOURCE_INVALID', {
        detail: `"${from.value}" is not an npm package name`,
      });
    }
    const name = packageOf(from.value);
    const version = files.packageVersion(name);
    if (version === undefined) throw new KitvasError('KIT_PACKAGE_MISSING', { name });
    return { type: 'npm', package: name, version };
  }
  const path = from.value;
  if (!PROJECT_PATH.test(path)) {
    throw new KitvasError('KIT_SOURCE_INVALID', {
      detail: `"${path}" is not a folder of the project (a path from its root, without "..")`,
    });
  }
  if (!files.exists(path)) {
    throw new KitvasError('KIT_SOURCE_INVALID', { detail: `"${path}" does not exist` });
  }
  if (!files.realInside(path)) {
    throw new KitvasError('KIT_SOURCE_INVALID', { detail: `"${path}" leads outside the project` });
  }
  return { type: 'repo', path };
}

/**
 * kitvas builds with the project's Tailwind 3 or 4, so Tailwind 2 or older is refused. A project's
 * own folder is styled with the project's Tailwind; a package only when it depends on Tailwind.
 */
function refuseOldTailwind(files: ProjectSetup, source: ProjectSource): void {
  const version = files.packageVersion('tailwindcss');
  const major = version === undefined ? undefined : majorVersion(version);
  if (major === undefined || major >= 3) return;
  // Only the project's own folder and npm packages are styled with the project's Tailwind; a
  // written kit has its own CSS Modules.
  if (source.type !== 'repo' && source.type !== 'npm') return;
  const usesIt =
    source.type === 'repo' || files.packageDependencies(source.package).includes('tailwindcss');
  if (!usesIt) return;
  throw new KitvasError('KIT_SOURCE_INVALID', {
    detail: `the project has Tailwind CSS ${version}; kitvas builds with Tailwind 3 or 4`,
  });
}

function skeleton(id: string, source: ProjectSource, files: ProjectSetup): Kit {
  const packages: Kit['runtime']['packages'] = [];
  if (source.type === 'npm') packages.push({ name: source.package, version: source.version });
  for (const name of ['react', 'react-dom']) {
    const version = files.packageVersion(name);
    if (version !== undefined && !packages.some((entry) => entry.name === name)) {
      packages.push({ name, version });
    }
  }
  return {
    schemaVersion: 1,
    id,
    name: id,
    version: source.type === 'npm' ? source.version : '0.0.0',
    source,
    framework: 'react',
    runtime: {
      packages,
      entry: GENERATED_ENTRY,
      styles: { files: [], generated: 'none', imports: [] },
      providers: [],
      clientOnly: false,
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    // The contract needs at least one component: `kit check` says so until the learner adds them.
    components: [],
    gaps: [],
  };
}

/**
 * Creates `<project>/.kitvas/kits/<id>/` with kit.json, an empty json/tokens.json and
 * generated/kit.ts. Refuses an id that is taken (KIT_EXISTS), a package that is not installed
 * (KIT_PACKAGE_MISSING) and a folder that does not exist or leads outside the project, or a source
 * styled with Tailwind 2 or older (KIT_SOURCE_INVALID). What it writes is not validated: it is a skeleton.
 */
export function newKit(deps: NewKitDeps, id: string, from: SourceFlag): NewKit {
  const checked = KitSchema.shape.id.safeParse(id);
  if (!checked.success) {
    throw new KitvasError('KIT_INVALID', {
      id,
      detail: `id: ${checked.error.issues[0]?.message ?? ''}`,
    });
  }
  refuseTaken(deps, id);
  let source: ProjectSource;
  let images: ImagePlan | undefined;
  if (from.type === 'npm' || from.type === 'repo') {
    source = resolveSource(deps.files, { ...from, type: from.type });
    refuseOldTailwind(deps.files, source);
  } else {
    ({ source, images } = resolveWrittenSource(deps.files, from));
  }

  const kit = skeleton(id, source, deps.files);
  deps.kitWriter.writeText(id, 'json/tokens.json', '{}\n');
  if (images) copyImages(deps.kitWriter, deps.files, id, images);
  deps.kitWriter.writeText(id, GENERATED_ENTRY, generatedEntry(kit).text);
  // kit.json goes last: until it exists, the folder is not a kit.
  deps.kitWriter.writeText(id, 'kit.json', `${JSON.stringify(kit, null, 2)}\n`);
  return { id, path: join(deps.kitsDir, id), source, skipped: images?.skipped ?? [] };
}
