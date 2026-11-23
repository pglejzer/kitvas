import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { type Gap, gapVar, withVars } from '../core/style.ts';

export type GridProps = HTMLAttributes<HTMLDivElement> & {
  /** 1 to 12. */
  columns?: number;
  gap?: Gap;
  /** One column under 640px. */
  collapse?: boolean;
};

export function Grid({
  columns = 2,
  gap = 'md',
  collapse = true,
  className,
  style,
  ...rest
}: GridProps) {
  const count = Math.min(12, Math.max(1, Math.round(columns)));
  return (
    <div
      {...rest}
      className={cx('kit-grid', collapse && 'kit-grid--collapse', className)}
      style={withVars(style, { '--_gap': gapVar(gap), '--_columns': count })}
    />
  );
}
