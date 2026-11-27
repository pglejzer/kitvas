import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article';
  /** `md` is 16 px, `lg` is 24 px. */
  padding?: 'none' | 'md' | 'lg';
  /** The shadow under the card: none, a low one, or the island's. */
  elevation?: 'none' | 'low' | 'island';
};

export function Card({
  as: Tag = 'div',
  padding = 'md',
  elevation = 'none',
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        'kit-card',
        padding !== 'none' && `kit-card--${padding}`,
        elevation !== 'none' && `kit-card--${elevation}`,
        className,
      )}
    />
  );
}
