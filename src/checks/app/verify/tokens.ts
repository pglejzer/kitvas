// Step `tokens`: every token mapped onto a variable of the design system has the value the
// browser reads from that variable, inside the kit's providers.

import { type FlatToken, formatTokenValue, type LoadedKit } from '../../../kit/index.ts';
import type { CatalogReport } from '../../../render/index.ts';
import type { VerifyIssue } from '../../domain/kit-verify.ts';
import {
  colorHex,
  compareToken,
  type TokenExpected,
  tokenRgba,
} from '../../domain/token-compare.ts';
import { EXAMPLE_VIEWPORT, exampleSearch } from './render.ts';
import { type Inspector, ran, SKIPPED, type StepResult } from './step.ts';

/** The variables the kit's tokens are mapped onto, each once, in the map's order. */
export const mappedVariables = (loaded: LoadedKit): string[] => [
  ...new Set(Object.values(loaded.cssVarMap)),
];

function expectedOf(token: FlatToken): TokenExpected {
  if (token.type !== 'color') return { type: token.type, css: formatTokenValue(token) };
  const rgba = tokenRgba(token.value.components, token.value.alpha ?? 1);
  return { type: 'color', css: colorHex(rgba), rgba };
}

export type TokensInput = {
  loaded: LoadedKit;
  /** The catalog build made for this run, with the mapped variables as its probe. */
  build: CatalogReport;
  inspect: Inspector;
};

export async function tokensStep({ loaded, build, inspect }: TokensInput): Promise<StepResult> {
  const mapped = Object.entries(loaded.cssVarMap);
  // Nothing mapped: nothing to compare. No page: nothing to read from.
  if (loaded.kit.tokens.cssVars === undefined || mapped.length === 0 || !build.built) {
    return SKIPPED;
  }

  // The first example puts the kit's providers on the page; a variable set on `:root` can be read
  // without any example.
  const first = build.shown[0];
  const report = await inspect({
    page: build.path,
    search: first === undefined ? '' : exampleSearch(first),
    ...EXAMPLE_VIEWPORT,
    vars: mappedVariables(loaded),
  });

  const tokens = new Map(loaded.tokens.map((token) => [token.path.join('.'), token]));
  const issues: VerifyIssue[] = [];
  for (const [name, variable] of mapped) {
    const token = tokens.get(name);
    // A map entry without a token is a `schema` issue.
    if (!token) continue;
    const verdict = compareToken(expectedOf(token), {
      value: report.vars[variable] ?? '',
      color: report.colors[variable] ?? null,
    });
    if (verdict.result === 'same') continue;
    const path = `tokens.${name}`;
    if (verdict.result === 'unread') {
      issues.push({
        step: 'tokens',
        path,
        key: 'kitIssue.tokenUnread',
        params: { variable, token: name },
      });
      continue;
    }
    issues.push({
      step: 'tokens',
      path,
      key: 'kitIssue.tokenMismatch',
      params: { token: name, expected: verdict.expected, actual: verdict.actual, variable },
    });
  }
  return ran(issues);
}
