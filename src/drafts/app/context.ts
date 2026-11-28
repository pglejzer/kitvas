// Use case: everything an agent needs to write one section, and nothing else.

import { join } from 'node:path';
import {
  cssVarName,
  type FlatToken,
  findComponent,
  formatTokenValue,
  type KitComponent,
  type KitStore,
  type LoadedKit,
} from '../../kit/index.ts';
import { type DraftOption, KitvasError, type SharedValue } from '../../shared/index.ts';
import { pascalCase, versionFolder } from '../domain/names.ts';
import { DEFAULT_STATES, type States, StatesSchema } from '../domain/states.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { inspectLayout, sectionPaths } from './layout.ts';
import { readOptions } from './options.ts';
import { readSharedValues } from './shared-values.ts';
import { type TailwindFiles, tailwindClasses, tailwindFacts } from './tailwind-facts.ts';
import { lockedIdsNow } from './view.ts';

export type ContextToken = {
  /** `--kit-color-brand` */
  name: string;
  type: FlatToken['type'];
  /** The value as CSS reads it: `#0f7a52`, `16px`, `600`. */
  value: string;
  /** First segment of the token's path: `color`, `space`, `radius`... */
  group: string;
};

export type SectionContext = {
  draft: { slug: string; title: string; version: number };
  section: { id: string; component: string; purpose: string; components: string[] };
  /** Every section of the screen in order, so the agent knows what is around its own. */
  outline: { id: string; purpose: string }[];
  /** The text of md/brief.md. */
  brief: string;
  states: States;
  /** The version's options (`src/json/options.json`); empty for none. */
  options: DraftOption[];
  /** The version's shared values (`src/json/shared.json`); empty for none. */
  sharedValues: SharedValue[];
  kit: {
    id: string;
    /** Catalog entries of the components this section may use. */
    components: KitComponent[];
    /** The custom properties styles may use, with the value each one has. */
    tokens: ContextToken[];
    /** Reference images of the section's components that exist in the kit, absolute paths. */
    references: { component: string; example: string; path: string }[];
    icons: string[];
  };
  /** The text of the layout's `## shared` block; `''` when there is none. */
  shared: string;
  /**
   * How the kit is styled: `sheets` (the section's SCSS with `--kit-*` names) or `tailwind`
   * (utility classes of the kit's theme in `className`).
   */
  styling: 'sheets' | 'tailwind';
  /** Tailwind kits only: the version of the project's Tailwind and the prefix its classes carry. */
  tailwind?: { version: 3 | 4; prefix: string };
  /**
   * Tailwind kits only: what the kit's tokens map onto (`cssVars.map`): a theme variable, or a
   * theme path as its dot path (`colors.primary`).
   */
  classes?: string[];
  /** Absolute paths of the two files the agent writes. */
  files: { tsx: string; scss: string };
  /**
   * Spec 4d, goal 4: the ids of the section's elements the person locked, as this version names
   * them. The agent never changes a locked element.
   */
  locked: string[];
};

/** The kit's tokens as a context gives them: the CSS name, the value CSS reads, the group. */
export function contextTokens(kit: LoadedKit): ContextToken[] {
  return kit.tokens.map((token) => ({
    name: cssVarName(token.path),
    type: token.type,
    value: formatTokenValue(token),
    group: token.path[0] ?? '',
  }));
}

/**
 * Writes the section's context to `<version>/build/context/<id>.json`, so the agent that writes the
 * section reads a file instead of a pasted copy. Returns the absolute path.
 */
export function saveSectionContext(
  store: DraftStore,
  kits: KitStore,
  slug: string,
  sectionId: string,
  files: TailwindFiles,
): { section: string; path: string } {
  const context = sectionContext(store, kits, slug, sectionId, files);
  // The id passed `sectionContext`, so it is a section id and cannot leave the folder.
  const rel = `${versionFolder(context.draft.version)}/build/context/${sectionId}.json`;
  store.writeText(slug, rel, `${JSON.stringify(context, null, 2)}\n`);
  return { section: sectionId, path: join(store.dir(slug), ...rel.split('/')) };
}

export function sectionContext(
  store: DraftStore,
  kits: KitStore,
  slug: string,
  sectionId: string,
  files: TailwindFiles,
): SectionContext {
  const { draft, version, base, kit, layout, issues } = inspectLayout(store, kits, slug);
  const first = issues[0];
  if (first) throw new KitvasError('DRAFT_INVALID', { slug, detail: first.path });
  const section = layout.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new KitvasError('SECTION_NOT_FOUND', { slug, section: sectionId });

  const states = StatesSchema.safeParse(store.readJson(slug, `${base}/src/json/states.json`));
  const paths = sectionPaths(base, section.id);
  const icons = kit.kit.icons?.source === 'component' ? kit.kit.icons.names : [];
  const tailwind = kit.kit.runtime.styles.tailwind !== undefined;
  const styling: SectionContext['styling'] = tailwind ? 'tailwind' : 'sheets';
  const components = section.components.map((name) => findComponent(kit, name));
  // Only images that exist: a missing one must not send an agent to a path that is not there.
  const references = components.flatMap((component) =>
    component.examples.flatMap((example) =>
      example.reference !== undefined && kits.exists(kit.kit.id, example.reference)
        ? [
            {
              component: component.name,
              example: example.title,
              path: join(kit.dir, ...example.reference.split('/')),
            },
          ]
        : [],
    ),
  );
  return {
    draft: { slug, title: draft.title, version },
    section: {
      id: section.id,
      component: pascalCase(section.id),
      purpose: section.purpose,
      components: section.components,
    },
    outline: layout.sections.map(({ id, purpose }) => ({ id, purpose })),
    brief: store.readText(slug, `${base}/md/brief.md`) ?? '',
    states: states.success ? states.data : DEFAULT_STATES,
    options: readOptions(store, slug, base),
    sharedValues: readSharedValues(store, slug, base),
    kit: {
      id: kit.kit.id,
      components,
      tokens: contextTokens(kit),
      references,
      icons,
    },
    // An element id starts with its file: `sections/Hero:section/Button`.
    locked: lockedIdsNow(store, slug, version).filter((id) =>
      id.startsWith(`sections/${pascalCase(section.id)}:`),
    ),
    shared: layout.shared,
    styling,
    ...(tailwind
      ? {
          tailwind: tailwindFacts(files, store, slug, base, kit),
          classes: tailwindClasses(kit),
        }
      : {}),
    files: {
      tsx: join(store.dir(slug), ...paths.tsx.split('/')),
      scss: join(store.dir(slug), ...paths.scss.split('/')),
    },
  };
}
