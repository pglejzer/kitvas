import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';

export type BarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  start?: ReactNode;
  middle?: ReactNode;
  end?: ReactNode;
};

export function Bar({ start, middle, end, className, ...rest }: BarProps) {
  return (
    <div {...rest} className={cx('kit-bar', className)}>
      <div className="kit-bar__start">{start}</div>
      <div className="kit-bar__middle">{middle}</div>
      <div className="kit-bar__end">{end}</div>
    </div>
  );
}
