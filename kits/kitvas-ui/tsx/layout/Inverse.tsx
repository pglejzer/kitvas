import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { type Space, spaceVar, withVars } from '../core/style.ts';

export type InverseProps = HTMLAttributes<HTMLDivElement> & {
  padding?: Space | 'none';
};

export function Inverse({ padding = '16', className, style, ...rest }: InverseProps) {
  return (
    <div
      {...rest}
      className={cx('kit-inverse', className)}
      style={withVars(style, { '--_pad': spaceVar(padding) })}
    />
  );
}
