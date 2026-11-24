// Edits of `md/layout.md` for the editor's section ops (spec 4b, sections; plan 14, task B5). A
// section is its `## <id>` heading and every line up to the next heading (`#` or `##`) or the end,
// found the way `parseLayout` finds them: a heading inside `<!-- -->` does not count. Pure: only
// the moved, added or removed block changes, with the blank lines around it; the `## shared` block,
// the text before the first section and every other line stay as written. Blank lines between
// blocks stay one: a block that goes leaves the blank lines before it, and a block that comes gets
// one blank line before it and takes over what followed the block it goes after.

import { SHARED_ID } from './layout.ts';

/** A heading line as `parseLayout` reads it, trimmed: `# title`, `## id`. */
const HEADING = /^(#{1,2})\s+(.+?)\s*$/;
/** A section heading line, for a rename: what stays around the id. */
const SECTION_HEADING = /^(\s*##\s+)(.+?)(\s*)$/;

/**
 * A run of lines, each with its own line ending: the text before the first heading, or a heading
 * and the lines under it. `id` is set only for a section (`## <id>` other than `## shared`).
 */
type Unit = {
  id: string | null;
  /** Up to the last line that is not blank. */
  body: string[];
  /** The blank lines after the body: what keeps it apart from the next unit or ends the text. */
  gap: string[];
};

type Parsed = {
  /** The first one is the text before the first heading, often empty. */
  units: Unit[];
  /** The text's own line ending: `\r\n` when it has one. */
  newline: string;
  /** The text ends with a line ending (or is empty). */
  ended: boolean;
};

const isBlank = (line: string): boolean => line.trim() === '';

function unitOf(id: string | null, lines: string[]): Unit {
  let end = lines.length;
  while (end > 0 && isBlank(lines[end - 1] ?? '')) end -= 1;
  return { id, body: lines.slice(0, end), gap: lines.slice(end) };
}

/** Every line gets a line ending here, so blocks can be moved; `print` takes an added one off. */
function parse(text: string): Parsed {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const ended = text === '' || text.endsWith('\n');
  const whole = ended ? text : `${text}${newline}`;
  const lines = whole === '' ? [] : whole.split(/(?<=\n)/);
  const starts: { at: number; id: string | null }[] = [];
  let inComment = false;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    // The comment rule of `parseLayout`, so both see the same headings.
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (line.startsWith('<!--')) {
      if (!line.includes('-->')) inComment = true;
      continue;
    }
    const heading = HEADING.exec(line);
    if (!heading) continue;
    const name = heading[2] ?? '';
    starts.push({ at: index, id: heading[1] === '##' && name !== SHARED_ID ? name : null });
  }
  const units = [unitOf(null, lines.slice(0, starts[0]?.at ?? lines.length))];
  for (const [index, start] of starts.entries()) {
    units.push(unitOf(start.id, lines.slice(start.at, starts[index + 1]?.at ?? lines.length)));
  }
  return { units, newline, ended };
}

function print({ units, ended }: Parsed): string {
  const text = units.map((unit) => [...unit.body, ...unit.gap].join('')).join('');
  return ended ? text : text.replace(/\r?\n$/, '');
}

const sectionAt = (units: Unit[], id: string): number => units.findIndex((unit) => unit.id === id);

/** Where a section put after section `after` goes (`null`: before the first section, or last). */
function placeOf(units: Unit[], after: string | null): number {
  if (after !== null) return sectionAt(units, after) + 1;
  const first = units.findIndex((unit) => unit.id !== null);
  return first < 0 ? units.length : first;
}

/**
 * Takes unit `index` out and gives back its lines. The blank lines before it now part its
 * neighbours; when it was the last, the unit before it takes over its gap, so the text ends as it
 * did.
 */
function takeOut(units: Unit[], index: number): string[] {
  const [unit] = units.splice(index, 1);
  const previous = units[index - 1];
  if (unit !== undefined && previous !== undefined && index === units.length) {
    previous.gap = unit.gap;
  }
  return unit?.body ?? [];
}

/**
 * Puts a section at `index`, one blank line after the unit before it. It takes over that unit's
 * gap, so what came after that unit (the next block, or the end of the text) stays as it was.
 */
function putIn(units: Unit[], index: number, id: string, body: string[], newline: string): void {
  const previous = units[index - 1];
  if (previous === undefined || (previous.body.length === 0 && previous.gap.length === 0)) {
    // Nothing before it: one blank line to the unit after it, when there is one.
    units.splice(index, 0, { id, body, gap: index < units.length ? [newline] : [] });
    return;
  }
  units.splice(index, 0, { id, body, gap: previous.gap });
  previous.gap = [newline];
}

/** The block of section `id` as written, with its heading; `null` when the layout has none. */
export function sectionBlock(text: string, id: string): string | null {
  const { units, ended } = parse(text);
  const at = sectionAt(units, id);
  const unit = units[at];
  if (unit === undefined) return null;
  const block = unit.body.join('');
  // The last block of a text without a final line ending has none either.
  const last = at === units.length - 1 && unit.gap.length === 0;
  return ended || !last ? block : block.replace(/\r?\n$/, '');
}

/**
 * The block `id` moved after section `after` (`null`: before the first section). The text as it
 * is when the block is already there; `null` when either section is not in the layout.
 */
export function moveSectionBlock(text: string, id: string, after: string | null): string | null {
  const parsed = parse(text);
  const { units } = parsed;
  const from = sectionAt(units, id);
  if (from < 0 || (after !== null && sectionAt(units, after) < 0)) return null;
  if (after === id || placeOf(units, after) === from) return text;
  const body = takeOut(units, from);
  putIn(units, placeOf(units, after), id, body, parsed.newline);
  return print(parsed);
}

/**
 * `block` (a whole `## <id>` block) inserted after section `after` (`null`: first), in the
 * layout's line endings. `null` when `after` is not in the layout, when the block is not exactly
 * one section, or when the layout already has a section of its id.
 */
export function insertSectionBlock(
  text: string,
  block: string,
  after: string | null,
): string | null {
  const parsed = parse(text);
  const { units, newline } = parsed;
  if (after !== null && sectionAt(units, after) < 0) return null;
  const own = block.replace(/\r?\n/g, newline);
  const [lead, section, ...rest] = parse(own.endsWith('\n') ? own : `${own}${newline}`).units;
  if (lead === undefined || lead.body.length > 0 || rest.length > 0) return null;
  const id = section?.id;
  if (section === undefined || id === undefined || id === null) return null;
  if (sectionAt(units, id) >= 0) return null;
  putIn(units, placeOf(units, after), id, section.body, newline);
  return print(parsed);
}

/** The layout without the block of section `id`; `null` when it has none. */
export function removeSectionBlock(text: string, id: string): string | null {
  const parsed = parse(text);
  const at = sectionAt(parsed.units, id);
  if (at < 0) return null;
  takeOut(parsed.units, at);
  return print(parsed);
}

/** The block with its heading's id changed to `id`; the rest of the block stays as written. */
export function renameSectionBlock(block: string, id: string): string {
  const end = block.search(/\r?\n|$/);
  const heading = SECTION_HEADING.exec(block.slice(0, end));
  if (!heading) return block;
  return `${heading[1] ?? ''}${id}${heading[3] ?? ''}${block.slice(end)}`;
}
