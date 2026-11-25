// The project's decisions file (ADR 0076): a short front matter of settings, then free text in five
// sections, one dated bullet per decision. Text in, text out: nothing here reads or writes a file.
// A write keeps every other byte of the text, including its own line ends and a leading BOM.

export const DECISION_SECTIONS = ['Kits', 'Copy', 'Layout', 'Checks', 'Other'] as const;
export type DecisionSection = (typeof DECISION_SECTIONS)[number];

export const SETTING_KEYS = ['kit', 'copy', 'check'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export type CheckDepth = 'normal' | 'deep';

/** The effective settings: what the file says, or the default of each. `copy` is null when unset. */
export type DecisionSettings = { kit: string; copy: string | null; check: CheckDepth };

export const DEFAULT_DECISION_SETTINGS: DecisionSettings = {
  kit: 'base',
  copy: null,
  check: 'normal',
};

/** The longest decision text, so one bullet stays one readable line. */
export const MAX_DECISION_LENGTH = 300;

const VALUE_PATTERNS: Record<SettingKey, RegExp> = {
  kit: /^[a-z0-9][a-z0-9-]{0,62}$/,
  copy: /^[a-z]{2}(-[A-Z]{2})?$/,
  check: /^(normal|deep)$/,
};

export const isSection = (text: string): text is DecisionSection =>
  (DECISION_SECTIONS as readonly string[]).includes(text);

export const isSettingKey = (text: string): text is SettingKey =>
  (SETTING_KEYS as readonly string[]).includes(text);

/** True when `value` has the shape the key allows (a kit must also exist: the caller checks). */
export const isValidSetting = (key: SettingKey, value: string): boolean =>
  VALUE_PATTERNS[key].test(value);

/** True for text that can be one bullet: one line, not empty, not longer than the limit. */
export const isOneLine = (text: string): boolean =>
  text.trim() !== '' && text.length <= MAX_DECISION_LENGTH && !/[\r\n]/.test(text);

export type DecisionWarningCode =
  | 'unclosedBlock'
  | 'unknownKey'
  | 'badLine'
  | 'badValue'
  | 'duplicateKey'
  /** The kit the file names does not exist; found by the caller, which knows the kits. */
  | 'kitMissing';

/** A problem found while reading: data, so each caller words it through `t()` in its own place. */
export type DecisionWarning = {
  code: DecisionWarningCode;
  /** 1-based line of the file. */
  line: number;
  params: Record<string, string | number>;
};

export type ParsedDecisions = {
  settings: Partial<DecisionSettings>;
  /** The 1-based line each accepted setting was read from. */
  lines: Partial<Record<SettingKey, number>>;
  /** Everything after the front matter; the whole text when there is none. */
  body: string;
  warnings: DecisionWarning[];
};

type Segment = { text: string; end: string };

const BOM = '﻿';
const SETTING_LINE = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;
const HEADING = /^##\s+(.+?)\s*$/;
const ANY_TITLE = /^#{1,2}\s/;
const BULLET = /^-\s+(.*?)(?:\s+\(\d{4}-\d{2}-\d{2}\))?\s*$/;

/** Lines with their own line end ('' for a last line without one), so they join back byte for byte. */
function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) {
      out.push({ text: text.slice(start), end: '' });
      break;
    }
    const crlf = newline > start && text[newline - 1] === '\r';
    out.push({ text: text.slice(start, crlf ? newline - 1 : newline), end: crlf ? '\r\n' : '\n' });
    start = newline + 1;
  }
  return out;
}

const joinSegments = (segments: Segment[]): string =>
  segments.map((segment) => segment.text + segment.end).join('');

/** The line end the file uses, for a line added to it. */
const eolOf = (segments: Segment[]): string =>
  segments.find((segment) => segment.end !== '')?.end ?? '\n';

function open(text: string): { bom: string; segments: Segment[] } {
  const bom = text.startsWith(BOM) ? BOM : '';
  return { bom, segments: segmentsOf(text.slice(bom.length)) };
}

type Block = { state: 'none' } | { state: 'open' } | { state: 'closed'; close: number };

/** The front matter: a first line of `---` and the next line of `---`. */
function blockOf(segments: Segment[]): Block {
  if (segments[0]?.text.trimEnd() !== '---') return { state: 'none' };
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index]?.text.trimEnd() === '---') return { state: 'closed', close: index };
  }
  return { state: 'open' };
}

function store(settings: Partial<DecisionSettings>, key: SettingKey, value: string): void {
  if (key === 'check') {
    if (value === 'normal' || value === 'deep') settings.check = value;
  } else {
    settings[key] = value;
  }
}

export function parseDecisions(text: string): ParsedDecisions {
  const { segments } = open(text);
  const block = blockOf(segments);
  const settings: Partial<DecisionSettings> = {};
  const lines: Partial<Record<SettingKey, number>> = {};
  const warnings: DecisionWarning[] = [];
  const whole = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  if (block.state === 'open') {
    warnings.push({ code: 'unclosedBlock', line: 1, params: {} });
    return { settings, lines, body: whole, warnings };
  }
  if (block.state === 'none') return { settings, lines, body: whole, warnings };

  for (let index = 1; index < block.close; index += 1) {
    const raw = (segments[index]?.text ?? '').trim();
    const line = index + 1;
    if (raw === '' || raw.startsWith('#')) continue;
    const match = SETTING_LINE.exec(raw);
    if (!match) {
      warnings.push({ code: 'badLine', line, params: { text: raw } });
      continue;
    }
    const key = match[1] ?? '';
    const value = (match[2] ?? '').trim();
    if (!isSettingKey(key)) {
      warnings.push({ code: 'unknownKey', line, params: { key } });
    } else if (!isValidSetting(key, value)) {
      warnings.push({ code: 'badValue', line, params: { key, value } });
    } else if (lines[key] !== undefined) {
      warnings.push({ code: 'duplicateKey', line, params: { key, first: lines[key] ?? 0 } });
    } else {
      store(settings, key, value);
      lines[key] = line;
    }
  }
  return { settings, lines, body: joinSegments(segments.slice(block.close + 1)), warnings };
}

/** The file as `kitvas init` writes it. */
export function decisionsTemplate(kit = 'base'): string {
  return [
    '---',
    `kit: ${kit}`,
    '---',
    '# Project decisions',
    '',
    'Settings go in the block above; each section below holds one dated bullet per decision. This file is shared through git.',
    '',
    ...DECISION_SECTIONS.flatMap((section) => [`## ${section}`, '']),
  ].join('\n');
}

/** `key: value` in the front matter: the first valid line is replaced, else one is added. */
export function withSetting(text: string, key: SettingKey, value: string): string {
  const { bom, segments } = open(text);
  const block = blockOf(segments);
  const entry = `${key}: ${value}`;
  if (block.state !== 'closed') {
    return `${bom}---${eolOf(segments)}${entry}${eolOf(segments)}---${eolOf(segments)}${joinSegments(segments)}`;
  }
  let first = -1;
  let valid = -1;
  for (let index = 1; index < block.close; index += 1) {
    const match = SETTING_LINE.exec((segments[index]?.text ?? '').trim());
    if (!match || match[1] !== key) continue;
    if (first < 0) first = index;
    if (valid < 0 && isValidSetting(key, (match[2] ?? '').trim())) valid = index;
  }
  const at = valid >= 0 ? valid : first;
  if (at >= 0) {
    segments[at] = { text: entry, end: segments[at]?.end ?? eolOf(segments) };
  } else {
    segments.splice(block.close, 0, { text: entry, end: eolOf(segments) });
  }
  return bom + joinSegments(segments);
}

/** Where a section's lines are: its heading and the index of the title that ends it. */
function sectionRange(
  segments: Segment[],
  section: DecisionSection,
): { head: number; end: number } | undefined {
  const block = blockOf(segments);
  const from = block.state === 'closed' ? block.close + 1 : 0;
  for (let head = from; head < segments.length; head += 1) {
    const match = HEADING.exec(segments[head]?.text ?? '');
    if (match?.[1] !== section) continue;
    let end = head + 1;
    while (end < segments.length && !ANY_TITLE.test(segments[end]?.text ?? '')) end += 1;
    return { head, end };
  }
  return undefined;
}

/** `withDecision` and the 1-based line the new bullet is on. */
export function addDecision(
  text: string,
  section: DecisionSection,
  line: string,
  date: string,
): { text: string; line: number } {
  const { bom, segments } = open(text);
  const eol = eolOf(segments);
  const entry = `- ${line} (${date})`;
  const range = sectionRange(segments, section);
  if (range) {
    let last = range.head;
    for (let index = range.head + 1; index < range.end; index += 1) {
      if ((segments[index]?.text ?? '').trim() !== '') last = index;
    }
    const before = segments[last] ?? { text: '', end: eol };
    const closed = before.end === '' ? eol : before.end;
    segments[last] = { text: before.text, end: closed };
    segments.splice(last + 1, 0, { text: entry, end: before.end === '' ? '' : closed });
    return { text: bom + joinSegments(segments), line: last + 2 };
  }
  const tail = segments.at(-1);
  if (tail && tail.end === '') segments[segments.length - 1] = { text: tail.text, end: eol };
  if (segments.length > 0 && (segments.at(-1)?.text ?? '').trim() !== '') {
    segments.push({ text: '', end: eol });
  }
  segments.push({ text: `## ${section}`, end: eol }, { text: entry, end: eol });
  return { text: bom + joinSegments(segments), line: segments.length };
}

/** Adds `- <line> (<date>)` at the end of the section; the heading is made at the end when missing. */
export const withDecision = (
  text: string,
  section: DecisionSection,
  line: string,
  date: string,
): string => addDecision(text, section, line, date).text;

/** `replaceDecision` and the 1-based line of the new bullet; null unless `old` is found once. */
export function swapDecision(
  text: string,
  section: DecisionSection,
  old: string,
  line: string,
  date: string,
): { text: string; line: number } | null {
  const { bom, segments } = open(text);
  const range = sectionRange(segments, section);
  if (!range) return null;
  const found: number[] = [];
  for (let index = range.head + 1; index < range.end; index += 1) {
    const match = BULLET.exec(segments[index]?.text ?? '');
    if (match && (match[1] ?? '').trim() === old) found.push(index);
  }
  const [at] = found;
  if (found.length !== 1 || at === undefined) return null;
  segments[at] = { text: `- ${line} (${date})`, end: segments[at]?.end ?? eolOf(segments) };
  return { text: bom + joinSegments(segments), line: at + 1 };
}

/** Swaps the one bullet of the section that reads `old` for a new one; null unless found once. */
export const replaceDecision = (
  text: string,
  section: DecisionSection,
  old: string,
  line: string,
  date: string,
): string | null => swapDecision(text, section, old, line, date)?.text ?? null;
