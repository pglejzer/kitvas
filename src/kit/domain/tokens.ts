// Design tokens in the DTCG 2025.10 format: nested groups, `$value`, inherited `$type`, `{alias}`.

import { z } from '../../shared/index.ts';
import type { KitIssue } from './issues.ts';

const channel = z.number().min(0).max(1);
const measure = (units: [string, ...string[]]) =>
  z.strictObject({ value: z.number(), unit: z.enum(units) });

const SHAPES = {
  color: z.strictObject({
    colorSpace: z.literal('srgb'),
    components: z.tuple([channel, channel, channel]),
    alpha: channel.optional(),
    hex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  }),
  dimension: measure(['px', 'rem']),
  duration: measure(['ms', 's']),
  fontFamily: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  fontWeight: z.number().int().min(1).max(1000),
  number: z.number(),
};

export type TokenType = keyof typeof SHAPES;

export type ColorValue = {
  colorSpace: 'srgb';
  components: [number, number, number];
  alpha?: number | undefined;
  hex?: string | undefined;
};

export type FlatToken =
  | { path: string[]; type: 'color'; value: ColorValue }
  | { path: string[]; type: 'dimension'; value: { value: number; unit: 'px' | 'rem' } }
  | { path: string[]; type: 'duration'; value: { value: number; unit: 'ms' | 's' } }
  | { path: string[]; type: 'fontFamily'; value: string | string[] }
  | { path: string[]; type: 'fontWeight'; value: number }
  | { path: string[]; type: 'number'; value: number };

type RawToken = { path: string[]; type: string | undefined; value: unknown };

type Resolved =
  | { ok: true; value: unknown; type: string | undefined; aliased: boolean }
  | { ok: false; key: string; params: KitIssue['params'] };

const ALIAS = /^\{([^{}]+)\}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function collect(node: unknown, path: string[], inherited: string | undefined, out: RawToken[]) {
  if (!isRecord(node)) return;
  const own = node.$type;
  const type = typeof own === 'string' ? own : inherited;
  if ('$value' in node) {
    out.push({ path, type, value: node.$value });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith('$')) collect(child, [...path, key], type, out);
  }
}

function resolve(start: RawToken, byPath: Map<string, RawToken>): Resolved {
  const visited = new Set<string>();
  let current = start;
  while (typeof current.value === 'string') {
    const target = ALIAS.exec(current.value)?.[1];
    if (target === undefined) break;
    if (visited.has(target)) return { ok: false, key: 'kitIssue.tokenAliasCycle', params: {} };
    visited.add(target);
    const next = byPath.get(target);
    if (!next) return { ok: false, key: 'kitIssue.tokenAliasMissing', params: { target } };
    current = next;
  }
  return { ok: true, value: current.value, type: current.type, aliased: current !== start };
}

/** Reads a token file. Tokens with a problem are left out and reported in `issues`. */
export function flattenTokens(raw: unknown): { tokens: FlatToken[]; issues: KitIssue[] } {
  const found: RawToken[] = [];
  collect(raw, [], undefined, found);
  const byPath = new Map(found.map((token) => [token.path.join('.'), token]));
  const tokens: FlatToken[] = [];
  const issues: KitIssue[] = [];

  for (const token of found) {
    const path = token.path.join('.');
    const report = (key: string, params: KitIssue['params'] = {}) =>
      issues.push({ path: `tokens.${path}`, key, params: { path, ...params } });

    const resolved = resolve(token, byPath);
    if (!resolved.ok) {
      report(resolved.key, resolved.params);
      continue;
    }
    const type = token.type ?? resolved.type;
    if (type === undefined) {
      report('kitIssue.tokenNoType');
      continue;
    }
    if (resolved.aliased && resolved.type !== undefined && resolved.type !== type) {
      report('kitIssue.tokenAliasType', { type, targetType: resolved.type });
      continue;
    }
    if (!Object.hasOwn(SHAPES, type)) {
      report('kitIssue.tokenUnknownType', { type });
      continue;
    }
    const parsed = SHAPES[type as TokenType].safeParse(resolved.value);
    if (!parsed.success) {
      report('kitIssue.tokenShape', { type });
      continue;
    }
    tokens.push({ path: token.path, type, value: parsed.data } as FlatToken);
  }
  return { tokens, issues };
}
