import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

const TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;
const SIZES = { 1: 'xl', 2: 'lg', 3: 'md', 4: 'sm' } as const;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level: 1 | 2 | 3 | 4;
  /** Defaults to the size that matches the level. */
  size?: 'xl' | 'lg' | 'md' | 'sm';
};

export function Heading({ level, size = SIZES[level], className, ...rest }: HeadingProps) {
  const Tag = TAGS[level];
  return <Tag {...rest} className={cx('kit-heading', `kit-heading--${size}`, className)} />;
}
