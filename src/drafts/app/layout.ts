// Use case: check a draft's layout against its kit and write the entry files.

import { type KitStore, type LoadedKit, requireKit } from '../../kit/index.ts';
import type { Issue } from '../../shared/index.ts';
import { craftEntryScss, craftEntryTsx } from '../domain/craft-entry.ts';
import { type Draft, latestVersion } from '../domain/draft.ts';
import { entryScss, entryTsx } from '../domain/entry.ts';
import { type Layout, layoutIssues, parseLayout } from '../domain/layout.ts';
import { pascalCase, versionFolder } from '../domain/names.ts';
import { statesIssues } from '../domain/states.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

export type SectionFiles = {
  id: string;
  /** Name of the component the section file must export. */
  component: string;
  /** Paths inside the draft folder. */
  tsx: string;
  scss: string;
  /** Both files exist. */
  written: boolean;
};

export type LayoutReport = {
  slug: string;
  version: number;
  valid: boolean;
  issues: Issue[];
  sections: SectionFiles[];
  /** Entry files written by this run; empty when the layout has problems. */
  generated: string[];
};

export type InspectedLayout = {
  draft: Draft;
  version: number;
  /** `v<version>`: the folder of the latest version inside the draft. */
  base: string;
  kit: LoadedKit;
  layout: Layout;
  issues: Issue[];
};

const EMPTY_LAYOUT: Layout = { title: '', screen: null, sections: [], shared: '' };

export const sectionPaths = (base: string, id: string): { tsx: string; scss: string } => ({
  tsx: `${base}/src/tsx/sections/${pascalCase(id)}.tsx`,
  scss: `${base}/src/scss/sections/${id}.scss`,
});

/** Reads the latest version's layout and states and collects their problems. Writes nothing. */
export function inspectLayout(store: DraftStore, kits: KitStore, slug: string): InspectedLayout {
  const draft = loadDraft(store, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const kit = requireKit(kits, draft.kit.id);
  if (draft.kind === 'craft') {
    // A craft draft has no layout: its entry is the sketch board.
    return { draft, version, base, kit, layout: EMPTY_LAYOUT, issues: [] };
  }
  const text = store.readText(slug, `${base}/md/layout.md`);
  if (text === undefined) {
    const issues = [{ path: 'layout', key: 'draftIssue.layoutMissing', params: {} }];
    return {
      draft,
      version,
      base,
      kit,
      layout: EMPTY_LAYOUT,
      issues,
    };
  }
  const layout = parseLayout(text);
  const known = new Set(kit.kit.components.map((component) => component.name));
  const issues = [
    ...layoutIssues(layout, known),
    ...statesIssues(store.readJson(slug, `${base}/src/json/states.json`)),
  ];
  return { draft, version, base, kit, layout, issues };
}

export function checkLayout(store: DraftStore, kits: KitStore, slug: string): LayoutReport {
  const { draft, kit, version, base, layout, issues } = inspectLayout(store, kits, slug);
  if (draft.craft) {
    const { icons } = kit.kit;
    const generated = [`${base}/src/tsx/index.tsx`, `${base}/src/scss/index.scss`];
    store.writeText(
      slug,
      generated[0] ?? '',
      craftEntryTsx({
        name: draft.craft.name,
        subject: draft.craft.subject,
        picked: draft.craft.picked,
        kitIcons: icons?.source === 'component' ? icons.names.slice(0, 6) : [],
        ...(icons?.source === 'component' ? { iconComponent: icons.component } : {}),
      }),
    );
    store.writeText(slug, generated[1] ?? '', craftEntryScss());
    return { slug, version, valid: true, issues: [], sections: [], generated };
  }
  const sections = layout.sections.map((section) => {
    const paths = sectionPaths(base, section.id);
    return {
      id: section.id,
      component: pascalCase(section.id),
      ...paths,
      written: store.exists(slug, paths.tsx) && store.exists(slug, paths.scss),
    };
  });

  const generated: string[] = [];
  if (issues.length === 0) {
    const files = [
      [`${base}/src/tsx/index.tsx`, entryTsx(layout.sections)],
      [`${base}/src/scss/index.scss`, entryScss(layout.sections)],
    ] as const;
    for (const [relPath, text] of files) {
      store.writeText(slug, relPath, text);
      generated.push(relPath);
    }
  }
  return { slug, version, valid: issues.length === 0, issues, sections, generated };
}
