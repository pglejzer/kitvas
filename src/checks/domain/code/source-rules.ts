// Rules that read the draft's TSX and SCSS sources, with a file and line (ADR 0043).

import type { CheckName, Message, RawFinding, Severity } from '../findings/finding.ts';

export type SourceFile = { file: string; text: string };

/** The ids of the rules in this file; each has an `auto` entry in the guideline book. */
export const SOURCE_RULE_IDS: readonly string[] = [
  'ux/paste-blocked',
  'ux/autofocus',
  'ui/transition-all',
  'ui/image-size',
];

type Place = { line: number; column: number };

/**
 * The text with comments as spaces (newlines kept, so places stay). Strings stay as they are, or
 * become spaces between their quotes with `blankStrings`. A quote in JSX text ends at the line end.
 */
function masked(text: string, blankStrings: boolean): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === '\n' ? '\n' : ' ';
    } else if (char === '"' || char === "'" || char === '`') {
      out += char;
      i += 1;
      while (i < text.length && text[i] !== char) {
        const here = text[i] ?? '';
        if (here === '\n' && char !== '`') break;
        if (here === '\\' && i + 1 < text.length) {
          out += blankStrings ? '  ' : here + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += blankStrings && here !== '\n' ? ' ' : here;
        i += 1;
      }
      if (text[i] === char) {
        out += char;
        i += 1;
      }
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

function placeOf(text: string, index: number): Place {
  const before = text.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function finding(
  file: string,
  place: Place,
  rule: string,
  severity: Severity,
  message: Message,
  hint: string,
): RawFinding {
  return {
    check: (rule.split('/')[0] ?? '') as CheckName,
    rule,
    severity,
    file,
    line: place.line,
    column: place.column,
    element: null,
    message,
    hint: { key: hint, params: {} },
    states: [],
    widths: [],
  };
}

/** The index after the bracket that closes the one at `open`, or the end of the text. */
function closing(text: string, open: number, up: string, down: string): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === up) depth += 1;
    else if (text[i] === down) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** The end of a tag that starts at `start`: its first `>` outside braces and strings. */
function tagEnd(text: string, start: number): number {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const char = text[i] ?? '';
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth <= 0) return i + 1;
  }
  return text.length;
}

function pasteFindings(file: string, text: string): RawFinding[] {
  const found: RawFinding[] = [];
  for (const match of text.matchAll(/\bonPaste\s*=\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const body = text.slice(open, closing(text, open, '{', '}'));
    if (!/\bpreventDefault\b/.test(body)) continue;
    found.push(
      finding(
        file,
        placeOf(text, match.index),
        'ux/paste-blocked',
        'fix',
        { key: 'checkRule.uxPasteBlocked', params: {} },
        'checkHint.uxPasteBlocked',
      ),
    );
  }
  return found;
}

function autofocusFindings(file: string, text: string): RawFinding[] {
  return [...text.matchAll(/\bautoFocus\b/g)].map((match) =>
    finding(
      file,
      placeOf(text, match.index),
      'ux/autofocus',
      'review',
      { key: 'checkRule.uxAutofocus', params: {} },
      'checkHint.uxAutofocus',
    ),
  );
}

const hasAll = (value: string): boolean => /(^|[\s,'"`])all(?=$|[\s,'"`])/.test(value);

function transitionFinding(file: string, text: string, index: number): RawFinding {
  return finding(
    file,
    placeOf(text, index),
    'ui/transition-all',
    'review',
    { key: 'checkRule.uiTransitionAll', params: {} },
    'checkHint.uiTransitionAll',
  );
}

function transitionScss(file: string, text: string): RawFinding[] {
  const found: RawFinding[] = [];
  for (const match of text.matchAll(/(?<![\w-])(transition(?:-property)?)\s*:\s*([^;}\n]*)/g)) {
    if (hasAll(match[2] ?? '')) found.push(transitionFinding(file, text, match.index));
  }
  return found;
}

function transitionTsx(file: string, text: string): RawFinding[] {
  const found: RawFinding[] = [];
  for (const match of text.matchAll(
    /\b(transition|transitionProperty)\s*:\s*(['"`])([^\n]*?)\2/g,
  )) {
    if (hasAll(match[3] ?? '')) found.push(transitionFinding(file, text, match.index));
  }
  return found;
}

function imageFindings(file: string, text: string): RawFinding[] {
  const found: RawFinding[] = [];
  for (const match of text.matchAll(/<img(?=[\s/>])/g)) {
    const tag = text.slice(match.index, tagEnd(text, match.index));
    const sized = /\swidth\s*=/.test(tag) && /\sheight\s*=/.test(tag);
    if (sized || /\baspectRatio\b/.test(tag)) continue;
    found.push(
      finding(
        file,
        placeOf(text, match.index),
        'ui/image-size',
        'review',
        { key: 'checkRule.uiImageSize', params: {} },
        'checkHint.uiImageSize',
      ),
    );
  }
  return found;
}

export function sourceRuleFindings({ file, text }: SourceFile): RawFinding[] {
  if (/\.scss$/i.test(file)) return transitionScss(file, masked(text, false));
  if (!/\.tsx$/i.test(file)) return [];
  const withStrings = masked(text, false);
  const code = masked(text, true);
  return [
    ...pasteFindings(file, code),
    ...autofocusFindings(file, code),
    ...transitionTsx(file, withStrings),
    ...imageFindings(file, withStrings),
  ];
}
