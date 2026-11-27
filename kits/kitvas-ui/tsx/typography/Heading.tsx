import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

const TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;
const SIZES = { 1: '3xl', 2: '2xl', 3: 'xl', 4: 'lg' } as const;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level: 1 | 2 | 3 | 4;
  /** Any step of the font size scale. Defaults to the size that matches the level. */
  size?: 'xs' | 'sm' | 'label' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
};

export function Heading({ level, size = SIZES[level], className, ...rest }: HeadingProps) {
  const Tag = TAGS[level];
  return <Tag {...rest} className={cx('kit-heading', `kit-heading--${size}`, className)} />;
}
