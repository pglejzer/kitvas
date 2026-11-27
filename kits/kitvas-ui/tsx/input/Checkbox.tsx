import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'children'> & {
  label: ReactNode;
};

/** A native checkbox, restyled in place so focus, the keyboard and forms keep working. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx('kit-checkbox', className)}>
      <input {...rest} type="checkbox" className="kit-checkbox__box" />
      <span className="kit-checkbox__label">{label}</span>
    </label>
  );
}
