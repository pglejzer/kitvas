// Use cases: the short views of a kit that the CLI and the studio show.

import { KitvasError } from '../../shared/index.ts';
import type { Kit, KitComponent, KitSource } from '../domain/contract.ts';
import type { KitThemes } from '../domain/themes.ts';
import type { KitStore } from '../ports/kit-store.ts';
import { type LoadedKit, loadKit } from './load-kit.ts';

export type KitSummary = {
  id: string;
  name: string;
  version: string;
  source: string;
  framework: string;
  hash: string;
  components: { name: string; category: string; description: string }[];
  tokens: number;
  icons: number;
  gaps: Kit['gaps'];
  issues: number;
  /** The kit's themes with their attributes, the project's marked `added` (ADR 0083). */
  themes: KitThemes;
  /** Dot paths of the tokens the project added. */
  addedTokens: string[];
};

export type KitListItem = {
  id: string;
  name: string | null;
  version: string | null;
  /** Where the kit comes from: `builtin` for a kit of kitvas itself. `null` when it cannot be read. */
  source: KitSource['type'] | null;
  components: number;
  valid: boolean;
};

export function summarizeKit(loaded: LoadedKit): KitSummary {
  const { kit } = loaded;
  return {
    id: kit.id,
    name: kit.name,
    version: kit.version,
    source: kit.source.type,
    framework: kit.framework,
    hash: loaded.hash,
    components: kit.components.map(({ name, category, description }) => ({
      name,
      category,
      description,
    })),
    tokens: loaded.tokens.length,
    icons: kit.icons?.source === 'component' ? kit.icons.names.length : 0,
    gaps: kit.gaps,
    issues: loaded.issues.length,
    themes: loaded.themes,
    addedTokens: loaded.addedTokens,
  };
}

export function findComponent(loaded: LoadedKit, name: string): KitComponent {
  const component = loaded.kit.components.find((candidate) => candidate.name === name);
  if (!component) throw new KitvasError('KIT_COMPONENT_NOT_FOUND', { id: loaded.kit.id, name });
  return component;
}

/** Every kit of the store. A kit that cannot be read is listed as not valid instead of failing the list. */
export function listKits(store: KitStore): KitListItem[] {
  return store.list().map((id) => {
    try {
      const loaded = loadKit(store, id);
      return {
        id,
        name: loaded.kit.name,
        version: loaded.kit.version,
        source: loaded.kit.source.type,
        components: loaded.kit.components.length,
        valid: loaded.issues.length === 0,
      };
    } catch (error) {
      if (!(error instanceof KitvasError)) throw error;
      return { id, name: null, version: null, source: null, components: 0, valid: false };
    }
  });
}
