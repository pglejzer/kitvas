import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article';
  padding?: 'none' | 'md' | 'lg';
};

export function Card({ as: Tag = 'div', padding = 'md', className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx('kit-card', padding !== 'none' && `kit-card--${padding}`, className)}
    />
  );
}
