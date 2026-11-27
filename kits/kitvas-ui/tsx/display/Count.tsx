import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type CountProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  value: number;
  /** Above this the count shows as "<max>+". */
  max?: number;
  tone?: 'neutral' | 'review' | 'fix';
};

export function Count({ value, max = 99, tone = 'neutral', className, ...rest }: CountProps) {
  return (
    <span
      {...rest}
      className={cx('kit-count', tone !== 'neutral' && `kit-count--${tone}`, className)}
    >
      {value > max ? `${max}+` : value}
    </span>
  );
}
