import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type DotProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  tone?: 'neutral' | 'accent' | 'good' | 'review' | 'fix';
  /** What the dot says, read out by assistive technology. */
  label: string;
  /** Fades in and out, for work in progress. */
  pulse?: boolean;
};

export function Dot({ tone = 'neutral', label, pulse, className, ...rest }: DotProps) {
  return (
    <span
      {...rest}
      className={cx('kit-dot', `kit-dot--${tone}`, pulse && 'kit-dot--pulse', className)}
    >
      <span className="kit-dot__mark" aria-hidden="true" />
      <span className="kit-visually-hidden">{label}</span>
    </span>
  );
}
