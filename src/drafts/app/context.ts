// Use case: everything an agent needs to write one section, and nothing else.

import { join } from 'node:path';
import { cssVarName, findComponent, type KitComponent, type KitStore } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { pascalCase } from '../domain/names.ts';
import { DEFAULT_STATES, type States, StatesSchema } from '../domain/states.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { inspectLayout, sectionPaths } from './layout.ts';

export type SectionContext = {
  draft: { slug: string; title: string; version: number };
  section: { id: string; component: string; purpose: string; components: string[] };
  /** Every section of the screen in order, so the agent knows what is around its own. */
  outline: { id: string; purpose: string }[];
  /** The text of md/brief.md. */
  brief: string;
  states: States;
  kit: {
    id: string;
    /** Catalog entries of the components this section may use. */
    components: KitComponent[];
    /** Names of the custom properties styles may use. */
    tokens: string[];
    icons: string[];
  };
  /**
   * How the kit is styled: `sheets` (the section's SCSS with `--kit-*` names) or `tailwind`
   * (utility classes of the kit's theme in `className`).
   */
  styling: 'sheets' | 'tailwind';
  /** Tailwind kits only: the theme variables the kit's tokens map onto (`cssVars.map`). */
  classes?: string[];
  /** Absolute paths of the two files the agent writes. */
  files: { tsx: string; scss: string };
};

export function sectionContext(
  store: DraftStore,
  kits: KitStore,
  slug: string,
  sectionId: string,
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
    kit: {
      id: kit.kit.id,
      components: section.components.map((name) => findComponent(kit, name)),
      tokens: kit.tokens.map((token) => cssVarName(token.path)),
      icons,
    },
    styling,
    ...(tailwind ? { classes: [...new Set(Object.values(kit.cssVarMap))] } : {}),
    files: {
      tsx: join(store.dir(slug), ...paths.tsx.split('/')),
      scss: join(store.dir(slug), ...paths.scss.split('/')),
    },
  };
}
