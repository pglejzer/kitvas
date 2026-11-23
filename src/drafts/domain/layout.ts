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
};

/** The heading of the block every section reads; reserved, so no section can take the name. */
export const SHARED_ID = 'shared';

const HEADING = /^(#{1,2})\s+(.+?)\s*$/;
const FIELD = /^(?:[-*]\s+)?(purpose|components)\s*:\s*(.*)$/i;

/**
 * Reads `# title`, `## section-id`, and the `Purpose:` and `Components:` lines of each section.
 * The `## shared` block is kept as text.
 */
export function parseLayout(text: string): Layout {
  let title = '';
  let current: LayoutSection | undefined;
  let inShared = false;
  let inComment = false;
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
      current = undefined;
      if (heading[1] === '#') {
        if (!title) title = name.replace(/^layout:\s*/i, '');
      } else if (!inShared) {
        current = { id: name, purpose: '', components: [], line: index + 1 };
        sections.push(current);
      }
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
  return { title, sections, shared: shared.join('\n').trim() };
}

/** `known` holds the component names of the draft's kit. */
export function layoutIssues(layout: Layout, known: ReadonlySet<string>): Issue[] {
  if (layout.sections.length === 0) {
    return [{ path: 'layout', key: 'draftIssue.noSections', params: {} }];
  }
  const issues: Issue[] = [];
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
