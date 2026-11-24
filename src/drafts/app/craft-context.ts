// Use case: everything the sketcher needs for a craft draft's sketches (the kit's facts, the brief
// and the files it writes), in one answer. A craft draft has no sections, so it has no section
// context; this is its own.

import { join } from 'node:path';
import { type KitComponent, type KitStore, requireKit } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { type CraftSubject, latestVersion, SKETCHES, type Sketch } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { type ContextToken, contextTokens } from './context.ts';
import { loadDraft } from './load-draft.ts';
import { lockedIdsNow } from './view.ts';

/** What the kit says of its icons: its own icon component with the names, or a package. */
export type CraftIcons =
  | { component: string; names: string[] }
  | { package: string; importPath: string };

export type CraftContext = {
  draft: { slug: string; title: string; version: number };
  craft: { subject: CraftSubject; name: string; description: string; picked: Sketch | null };
  /** The text of md/brief.md. */
  brief: string;
  kit: {
    id: string;
    /** The custom properties a sketch may use, with the value each one has. */
    tokens: ContextToken[];
    /**
     * Catalog entries the subject builds on: a component gets the whole catalog, an icon the kit's
     * icon component alone, a logo none.
     */
    components: KitComponent[];
    /** `null` for a kit without icons. */
    icons: CraftIcons | null;
  };
  /** As in a section context: `sheets` or `tailwind`. */
  styling: 'sheets' | 'tailwind';
  /** Tailwind kits only: the theme variables the kit's tokens map onto. */
  classes?: string[];
  /** Absolute paths of each sketch this version holds and of its reasons file. */
  files: { sketch: Sketch; tsx: string; why: string }[];
  /** The ids of the elements the person locked, as this version names them. */
  locked: string[];
};

/** Where `saveCraftContext` writes, inside the version folder. */
export const CRAFT_CONTEXT_FILE = 'build/context/craft.json';

export function craftContext(store: DraftStore, kits: KitStore, slug: string): CraftContext {
  const draft = loadDraft(store, slug);
  const { craft } = draft;
  if (craft === undefined) {
    throw new KitvasError('DRAFT_KIND', { slug, kind: draft.kind, needed: 'craft' });
  }
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const kit = requireKit(kits, draft.kit.id);
  const said = kit.kit.icons;
  const icons: CraftIcons | null =
    said === undefined
      ? null
      : said.source === 'component'
        ? { component: said.component, names: said.names }
        : { package: said.package, importPath: said.importPath };
  const components =
    craft.subject === 'component'
      ? kit.kit.components
      : craft.subject === 'icon' && said?.source === 'component'
        ? kit.kit.components.filter((component) => component.name === said.component)
        : [];
  const tailwind = kit.kit.runtime.styles.tailwind !== undefined;
  const dir = store.dir(slug);
  return {
    draft: { slug, title: draft.title, version },
    craft: { ...craft },
    brief: store.readText(slug, `${base}/md/brief.md`) ?? '',
    kit: { id: kit.kit.id, tokens: contextTokens(kit), components, icons },
    styling: tailwind ? 'tailwind' : 'sheets',
    ...(tailwind ? { classes: [...new Set(Object.values(kit.cssVarMap))] } : {}),
    // After a pick the version holds one sketch; only the files that are there are named.
    files: SKETCHES.filter((sketch) =>
      store.exists(slug, `${base}/src/tsx/sketches/${sketch}.tsx`),
    ).map((sketch) => ({
      sketch,
      tsx: join(dir, base, 'src', 'tsx', 'sketches', `${sketch}.tsx`),
      why: join(dir, base, 'why', `${sketch}.json`),
    })),
    locked: lockedIdsNow(store, slug, version),
  };
}

/**
 * Writes the craft context to `<version>/build/context/craft.json`, so the sketcher reads a file
 * instead of a pasted copy. Returns the absolute path.
 */
export function saveCraftContext(
  store: DraftStore,
  kits: KitStore,
  slug: string,
): { path: string } {
  const context = craftContext(store, kits, slug);
  const rel = `${versionFolder(context.draft.version)}/${CRAFT_CONTEXT_FILE}`;
  store.writeText(slug, rel, `${JSON.stringify(context, null, 2)}\n`);
  return { path: join(store.dir(slug), ...rel.split('/')) };
}
