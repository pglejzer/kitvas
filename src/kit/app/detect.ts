// `kit detect`: what in the project points at a design system. Read only; the rework and craft
// skills use the answer to choose a kit before they build.

import { isRecord, KitvasError } from '../../shared/index.ts';
import { FIGMA_URL } from '../domain/contract.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { ProjectSetup } from '../ports/project-files.ts';
import { loadKit } from './load-kit.ts';

export type DetectedKit = {
  id: string;
  /** The kit's source type (`npm`, `repo`, `figma`, `web`, `images`), or `unknown` when kit.json is unreadable. */
  source: string;
  /** True when the last `kit verify` was for another kit hash, or there was none, or the kit cannot load. */
  stale: boolean;
};

export type Detected = {
  kits: DetectedKit[];
  /** The kit the project's settings name, when the store has it. */
  active: string | null;
  signs: { components: string[]; packages: string[]; figma: string[] };
};

export type DetectDeps = {
  kits: KitStore;
  files: ProjectSetup;
  /** The hash `kit verify` recorded for a kit, or undefined when it was never verified. */
  verifiedHash(id: string): string | undefined;
  /** The kit id the project's settings name. */
  activeKit: string;
};

/** Folders where a project keeps its own components, and how many `.tsx` files make a sign. */
export const COMPONENT_FOLDERS = ['src/components', 'components', 'src/ui', 'ui'] as const;
export const COMPONENT_SIGN_FILES = 10;
/** Files looked at per folder; a folder this large is a sign long before the cap. */
const LIST_CAP = 2000;

/** Packages that are a design system on their own. */
export const DESIGN_SYSTEM_PACKAGES = [
  '@mui/material',
  '@chakra-ui/react',
  'antd',
  '@mantine/core',
  'react-bootstrap',
  '@radix-ui/themes',
  '@headlessui/react',
  '@fluentui/react-components',
  '@shadcn/ui',
  '@nextui-org/react',
] as const;

const NOTES_FILE = '.kitvas/notes.md';

function sourceOf(store: KitStore, id: string): string {
  try {
    const source = store.read(id)?.kitJson;
    const type = isRecord(source) && isRecord(source.source) ? source.source.type : undefined;
    return typeof type === 'string' ? type : 'unknown';
  } catch {
    return 'unknown';
  }
}

function detectKit(deps: DetectDeps, id: string): DetectedKit {
  try {
    const loaded = loadKit(deps.kits, id);
    return {
      id,
      source: loaded.kit.source.type,
      stale: deps.verifiedHash(id) !== loaded.hash,
    };
  } catch (error) {
    if (!(error instanceof KitvasError)) throw error;
    return { id, source: sourceOf(deps.kits, id), stale: true };
  }
}

function componentFolders(files: ProjectSetup): string[] {
  return COMPONENT_FOLDERS.filter((folder) => {
    const count = files
      .listFiles(folder)
      .slice(0, LIST_CAP)
      .filter((file) => file.endsWith('.tsx')).length;
    return count >= COMPONENT_SIGN_FILES;
  });
}

/** Known design-system packages the project depends on; a package.json that does not parse counts as none. */
function knownPackages(files: ProjectSetup): string[] {
  const bytes = files.readBytes('package.json');
  if (bytes === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const declared = new Set(
    ['dependencies', 'devDependencies'].flatMap((field) => {
      const value = parsed[field];
      return isRecord(value) ? Object.keys(value) : [];
    }),
  );
  return DESIGN_SYSTEM_PACKAGES.filter((name) => declared.has(name)).sort();
}

/** Figma design URLs written in the project's notes, each once, in the order they appear. */
function figmaLinks(files: ProjectSetup): string[] {
  const bytes = files.readBytes(NOTES_FILE);
  if (bytes === undefined) return [];
  const words = new TextDecoder().decode(bytes).split(/[\s<>()[\]"'`,]+/);
  const links = words
    .map((word) => word.replace(/[.;:!?*]+$/, ''))
    .filter((w) => FIGMA_URL.test(w));
  return [...new Set(links)];
}

export function detectKits(deps: DetectDeps): Detected {
  const ids = deps.kits.list();
  const projectIds = ids.filter((id) => {
    try {
      return deps.kits.read(id)?.project !== undefined;
    } catch {
      return false;
    }
  });
  return {
    kits: projectIds.map((id) => detectKit(deps, id)),
    active: ids.includes(deps.activeKit) ? deps.activeKit : null,
    signs: {
      components: componentFolders(deps.files),
      packages: knownPackages(deps.files),
      figma: figmaLinks(deps.files),
    },
  };
}
