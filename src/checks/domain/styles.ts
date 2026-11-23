// The ds check of a draft's style sheets: colours and sizes come from the kit's tokens.

import type { Message, RawFinding, Severity } from './finding.ts';

export type SizeToken = { name: string; value: number; unit: 'px' | 'rem' };

export type StyleInput = {
  /** Path inside the draft version: `src/scss/sections/hero.scss`. */
  file: string;
  text: string;
  /** Every `--kit-*` name of the kit. */
  tokens: ReadonlySet<string>;
  /** The kit's dimension tokens. */
  sizes: SizeToken[];
};

const NAMED_COLORS = [
  'aqua',
  'beige',
  'black',
  'blue',
  'brown',
  'coral',
  'crimson',
  'cyan',
  'fuchsia',
  'gold',
  'gray',
  'green',
  'grey',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lime',
  'magenta',
  'maroon',
  'navy',
  'olive',
  'orange',
  'pink',
  'purple',
  'red',
  'salmon',
  'silver',
  'teal',
  'tomato',
  'violet',
  'white',
  'yellow',
];

/** A declaration at the start of a line or after `{` or `;`: property and value. */
const DECLARATION = /(?:^|[{;])\s*(\$[\w-]+|--?[A-Za-z_][\w-]*|[a-z][a-z-]*)\s*:([^;{}]*)/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const NAMED = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`, 'gi');
const TOKEN = /var\(\s*(--kit-[A-Za-z0-9-]+)/g;
const VAR_CALL = /var\([^()]*\)/g;
const LENGTH = /(-?\d*\.?\d+)(px|rem)\b/g;

/** Which properties hold which kind of size, and the token names of that kind. */
const SIZE_KINDS = [
  {
    property: /^(?:margin|padding)(?:-[a-z-]+)?$|^(?:row-|column-)?gap$/,
    token: /space|spacing|gap|gutter/,
  },
  { property: /^border(?:-[a-z-]+)?-radius$/, token: /radius|round|corner/ },
  { property: /^font-size$/, token: /font-size|text-size|type-size/ },
];

const blank = (text: string): string => ' '.repeat(text.length);

/** The lines of a sheet with comments, strings and url() contents as spaces, so columns stay. */
export function codeLines(text: string): string[] {
  let inComment = false;
  return text.split(/\r?\n/).map((raw) => {
    const line = raw
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, blank)
      .replace(/url\([^)]*\)/g, blank);
    let out = '';
    let index = 0;
    while (index < line.length) {
      if (inComment) {
        const end = line.indexOf('*/', index);
        const stop = end === -1 ? line.length : end + 2;
        out += blank(line.slice(index, stop));
        inComment = end === -1;
        index = stop;
      } else if (line.startsWith('/*', index)) {
        inComment = true;
        out += '  ';
        index += 2;
      } else if (line.startsWith('//', index)) {
        out += blank(line.slice(index));
        index = line.length;
      } else {
        out += line.charAt(index);
        index += 1;
      }
    }
    return out;
  });
}

/** The value with every `var(…)` turned into spaces, nested ones too. */
function withoutVars(value: string): string {
  let current = value;
  for (let round = 0; round < 4; round += 1) {
    const next = current.replace(VAR_CALL, blank);
    if (next === current) break;
    current = next;
  }
  return current;
}

const toPx = (value: number, unit: string): number => (unit === 'rem' ? value * 16 : value);

export function styleFindings({ file, text, tokens, sizes }: StyleInput): RawFinding[] {
  const findings: RawFinding[] = [];
  const report = (
    line: number,
    column: number,
    rule: string,
    severity: Severity,
    message: Message,
    hint: Message,
  ): void => {
    findings.push({
      check: 'ds',
      rule,
      severity,
      file,
      line,
      column,
      element: null,
      message,
      hint,
      states: [],
      widths: [],
    });
  };

  for (const [index, line] of codeLines(text).entries()) {
    for (const declaration of line.matchAll(DECLARATION)) {
      const property = declaration[1] ?? '';
      const value = declaration[2] ?? '';
      const start = (declaration.index ?? 0) + declaration[0].length - value.length;
      const at = (offset: number): number => start + offset + 1;

      for (const use of value.matchAll(TOKEN)) {
        const name = use[1] ?? '';
        if (tokens.has(name)) continue;
        report(
          index + 1,
          at((use.index ?? 0) + use[0].indexOf('--')),
          'ds/unknown-token',
          'fix',
          { key: 'checkRule.unknownToken', params: { name } },
          { key: 'checkHint.unknownToken', params: {} },
        );
      }

      const plain = withoutVars(value);
      const colours = [
        ...[...plain.matchAll(HEX)].map((match) => ({ at: match.index ?? 0, text: match[0] })),
        ...[...plain.matchAll(COLOR_FUNCTION)].map((match) => {
          const from = match.index ?? 0;
          const close = plain.indexOf(')', from);
          return { at: from, text: plain.slice(from, close === -1 ? undefined : close + 1) };
        }),
        ...[...plain.matchAll(NAMED)].map((match) => ({ at: match.index ?? 0, text: match[0] })),
      ].sort((a, b) => a.at - b.at);
      for (const colour of colours) {
        report(
          index + 1,
          at(colour.at),
          'ds/raw-color',
          'fix',
          { key: 'checkRule.rawColor', params: { value: colour.text } },
          { key: 'checkHint.rawColor', params: {} },
        );
      }

      const kind = SIZE_KINDS.find((candidate) => candidate.property.test(property));
      const scale = kind ? sizes.filter((size) => kind.token.test(size.name)) : [];
      if (scale.length === 0) continue;
      for (const length of plain.matchAll(LENGTH)) {
        const px = Math.abs(toPx(Number(length[1]), length[2] ?? 'px'));
        if (px === 0) continue;
        const nearest = scale.reduce((best, size) =>
          Math.abs(toPx(size.value, size.unit) - px) < Math.abs(toPx(best.value, best.unit) - px)
            ? size
            : best,
        );
        const exact = toPx(nearest.value, nearest.unit) === px;
        const params = { value: length[0], token: nearest.name };
        report(
          index + 1,
          at(length.index ?? 0),
          'ds/raw-size',
          exact ? 'fix' : 'review',
          { key: exact ? 'checkRule.tokenValue' : 'checkRule.offScale', params },
          {
            key: exact ? 'checkHint.tokenValue' : 'checkHint.offScale',
            params: { token: nearest.name },
          },
        );
      }
    }
  }
  return findings;
}
