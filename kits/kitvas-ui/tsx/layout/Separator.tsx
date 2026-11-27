import type { ComponentPropsWithRef } from 'react';
import { cx } from '../core/cx.ts';

export type SeparatorProps = Omit<ComponentPropsWithRef<'hr'>, 'children'> & {
  orientation?: 'horizontal' | 'vertical';
};

export function Separator({ orientation = 'horizontal', className, ...rest }: SeparatorProps) {
  return (
    <hr
      {...rest}
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      className={cx('kit-separator', `kit-separator--${orientation}`, className)}
    />
  );
}
