// layout.md: the sections of a draft, written by an agent, read by kitvas.

import type { Issue } from '../../shared/index.ts';
import { SECTION_ID } from './names.ts';

export type LayoutSection = {
  id: string;
  purpose: string;
  /** Kit components the section will use. */
  components: string[];
  /** Line of the section heading, 1-based. */
  line: number;
};

export type Layout = {
  title: string;
  sections: LayoutSection[];
  /** The `## shared` block as written, trimmed; `''` when absent. It is not a section. */
  shared: string;
  /** The kind of the `Screen:` line above the sections; null when there is none or it names none. */
  screen: ScreenKind | null;
  /** The `Screen:` line's value, lower case, when it names no kind; `layoutIssues` reports it. */
  unknownScreen?: string;
};

/** The heading of the block every section reads; reserved, so no section can take the name. */
export const SHARED_ID = 'shared';

/** What a screen is, from the layout's `Screen:` line; some checks run only for some kinds. */
export const SCREEN_KINDS = [
  'landing',
  'form',
  'sign-in',
  'sign-up',
  'checkout',
  'dashboard',
  'list',
  'detail',
  'article',
  'settings',
  'other',
] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];

export const isScreenKind = (value: string): value is ScreenKind =>
  (SCREEN_KINDS as readonly string[]).includes(value);

const HEADING = /^(#{1,2})\s+(.+?)\s*$/;
const FIELD = /^(?:[-*]\s+)?(purpose|components)\s*:\s*(.*)$/i;
const SCREEN = /^(?:[-*]\s+)?screen\s*:\s*(.*)$/i;

/**
 * Reads `# title`, the `Screen:` line before the first `##` heading, `## section-id`, and the
 * `Purpose:` and `Components:` lines of each section. The `## shared` block is kept as text.
 */
export function parseLayout(text: string): Layout {
  let title = '';
  let current: LayoutSection | undefined;
  let inShared = false;
  let inComment = false;
  /** No `##` heading yet: the only place a `Screen:` line counts. */
  let top = true;
  let screenLine: string | undefined;
  const sections: LayoutSection[] = [];
  const shared: string[] = [];

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (line.startsWith('<!--')) {
      if (!line.includes('-->')) inComment = true;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const name = heading[2] ?? '';
      inShared = heading[1] === '##' && name === SHARED_ID;
      if (heading[1] === '##') top = false;
      current = undefined;
      if (heading[1] === '#') {
        if (!title) title = name.replace(/^layout:\s*/i, '');
      } else if (!inShared) {
        current = { id: name, purpose: '', components: [], line: index + 1 };
        sections.push(current);
      }
      continue;
    }

    if (top) {
      // The first one counts; a later one is just text.
      const screen = SCREEN.exec(line);
      if (screen && screenLine === undefined) screenLine = (screen[1] ?? '').trim().toLowerCase();
      continue;
    }
    if (inShared) {
      shared.push(raw.trimEnd());
      continue;
    }
    const field = FIELD.exec(line);
    if (!field || !current) continue;
    const value = (field[2] ?? '').trim();
    if ((field[1] ?? '').toLowerCase() === 'purpose') {
      current.purpose = value;
    } else {
      current.components = value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    }
  }
  const layout: Layout = { title, sections, shared: shared.join('\n').trim(), screen: null };
  if (screenLine === undefined) return layout;
  if (isScreenKind(screenLine)) return { ...layout, screen: screenLine };
  return { ...layout, unknownScreen: screenLine };
}

/** `known` holds the component names of the draft's kit. */
export function layoutIssues(layout: Layout, known: ReadonlySet<string>): Issue[] {
  const top: Issue[] =
    layout.unknownScreen === undefined
      ? []
      : [
          {
            path: 'layout',
            key: 'draftIssue.unknownScreen',
            params: { kind: layout.unknownScreen, kinds: SCREEN_KINDS.join(', ') },
          },
        ];
  if (layout.sections.length === 0) {
    return [...top, { path: 'layout', key: 'draftIssue.noSections', params: {} }];
  }
  const issues: Issue[] = [...top];
  const seen = new Set<string>();
  for (const section of layout.sections) {
    const { id } = section;
    const report = (key: string, params: Issue['params'] = {}) =>
      issues.push({ path: `layout.${id}`, key, params: { id, ...params } });

    if (!SECTION_ID.test(id) || id === SHARED_ID) report('draftIssue.badSectionId');
    if (seen.has(id)) report('draftIssue.duplicateSection');
    seen.add(id);
    if (!section.purpose) report('draftIssue.noPurpose');
    if (section.components.length === 0) report('draftIssue.noComponents');
    for (const name of section.components) {
      if (!known.has(name)) report('draftIssue.unknownComponent', { name });
    }
  }
  return issues;
}
