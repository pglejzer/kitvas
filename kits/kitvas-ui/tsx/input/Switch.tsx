import { type ComponentPropsWithRef, useState } from 'react';
import { cx } from '../core/cx.ts';

export type SwitchProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'role' | 'children' | 'onChange' | 'checked' | 'defaultChecked'
> & {
  label: string;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onChange?: ((checked: boolean) => void) | undefined;
};

/** A native checkbox with role switch: Space toggles it, forms read it as a checkbox. */
export function Switch({
  label,
  checked,
  defaultChecked = false,
  onChange,
  className,
  ...rest
}: SwitchProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  return (
    <label className={cx('kit-switch', className)}>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        aria-checked={on}
        checked={on}
        className="kit-switch__input"
        onChange={(event) => {
          setInner(event.currentTarget.checked);
          onChange?.(event.currentTarget.checked);
        }}
      />
      <span className="kit-switch__label">{label}</span>
    </label>
  );
}
