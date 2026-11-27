import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';

export type KbdProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  children: ReactNode;
};

export function Kbd({ className, children, ...rest }: KbdProps) {
  return (
    <kbd {...rest} className={cx('kit-kbd', className)}>
      {children}
    </kbd>
  );
}
