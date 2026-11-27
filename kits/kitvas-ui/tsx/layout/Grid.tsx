import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { type Space, spaceVar, withVars } from '../core/style.ts';

export type GridProps = HTMLAttributes<HTMLDivElement> & {
  /** 1 to 12. */
  columns?: number;
  gap?: Space | 'none';
  /** Two columns under 960px when there are three or more; one column under 640px. */
  collapse?: boolean;
};

export function Grid({
  columns = 2,
  gap = '12',
  collapse = true,
  className,
  style,
  ...rest
}: GridProps) {
  const count = Math.min(12, Math.max(1, Math.round(columns)));
  return (
    <div
      {...rest}
      className={cx(
        'kit-grid',
        collapse && 'kit-grid--collapse',
        collapse && count >= 3 && 'kit-grid--wide',
        className,
      )}
      style={withVars(style, { '--_gap': spaceVar(gap), '--_columns': count })}
    />
  );
}
