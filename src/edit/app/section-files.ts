// Which source files of a draft version the editor reads and writes (plan 13, task D2). A section
// is `src/tsx/sections/<Pascal>.tsx` with its styles in `src/scss/sections/<id>.scss` or the
// partial `_<id>.scss` (the generated `index.scss` uses `@use 'sections/<id>'`, which finds either).

import {
  type DraftStore,
  parseLayout,
  pascalCase,
  SECTION_ID,
  SKETCHES,
  versionFolder,
} from '../../drafts/index.ts';

const SECTION_TSX = /^src\/tsx\/sections\/([A-Za-z0-9]+)\.tsx$/;

/** The section ids of the version's layout; an id that could name another path is left out. */
function sectionIds(drafts: DraftStore, slug: string, version: number): string[] {
  const text = drafts.readText(slug, `${versionFolder(version)}/md/layout.md`);
  if (text === undefined) return [];
  return parseLayout(text)
    .sections.map((section) => section.id)
    .filter((id) => SECTION_ID.test(id));
}

/** Both names a section's SCSS may have, the plain one first. */
const scssNames = (id: string): string[] => [
  `src/scss/sections/${id}.scss`,
  `src/scss/sections/_${id}.scss`,
];

/**
 * The SCSS file of the section that `tsxFile` (`src/tsx/sections/Hero.tsx`) is, as a path inside
 * the version; `null` for a file that is no section of the layout, or a section without SCSS.
 */
export function sectionScss(
  drafts: DraftStore,
  slug: string,
  version: number,
  tsxFile: string,
): string | null {
  const component = SECTION_TSX.exec(tsxFile)?.[1];
  if (component === undefined) return null;
  const id = sectionIds(drafts, slug, version).find((each) => pascalCase(each) === component);
  if (id === undefined) return null;
  const base = versionFolder(version);
  return scssNames(id).find((file) => drafts.exists(slug, `${base}/${file}`)) ?? null;
}

/**
 * The version's source files the editor tracks by ETag, sorted: each section's TSX and SCSS and a
 * craft draft's sketches, those that exist. The generated `src/tsx/index.tsx` and
 * `src/scss/index.scss` are never among them. The draft store cannot list a folder, so the files
 * are the ones kitvas itself names; they are also the only ones an edit can reach with a style.
 */
export function sourceFiles(drafts: DraftStore, slug: string, version: number): string[] {
  const base = versionFolder(version);
  const named = [
    ...sectionIds(drafts, slug, version).flatMap((id) => [
      `src/tsx/sections/${pascalCase(id)}.tsx`,
      ...scssNames(id),
    ]),
    ...SKETCHES.map((sketch) => `src/tsx/sketches/${sketch}.tsx`),
  ];
  return [...new Set(named)].filter((file) => drafts.exists(slug, `${base}/${file}`)).sort();
}
