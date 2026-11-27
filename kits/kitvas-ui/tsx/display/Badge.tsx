import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'fix' | 'review' | 'good';
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx('kit-badge', tone !== 'neutral' && `kit-badge--${tone}`, className)}
    />
  );
}
