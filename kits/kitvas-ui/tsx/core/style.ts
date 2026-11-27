import type { CSSProperties } from 'react';

export type Space =
  | '2'
  | '4'
  | '6'
  | '8'
  | '10'
  | '12'
  | '14'
  | '16'
  | '24'
  | '32'
  | '48'
  | '64'
  | '96';

/** The space token of a step, as a CSS value; `'none'` is no space. */
export const spaceVar = (space: Space | 'none'): string =>
  space === 'none' ? '0' : `var(--kit-space-${space})`;

/** Adds component-local custom properties (`--_name`) to an inline style. */
export const withVars = (
  style: CSSProperties | undefined,
  vars: Record<string, string | number>,
): CSSProperties => ({ ...style, ...vars }) as CSSProperties;
