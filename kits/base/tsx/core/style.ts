import type { CSSProperties } from 'react';

export type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

/** The space token of a gap name, as a CSS value. */
export const gapVar = (gap: Gap): string => `var(--kit-space-${gap})`;

/** Adds component-local custom properties (`--_name`) to an inline style. */
export const withVars = (
  style: CSSProperties | undefined,
  vars: Record<string, string | number>,
): CSSProperties => ({ ...style, ...vars }) as CSSProperties;
