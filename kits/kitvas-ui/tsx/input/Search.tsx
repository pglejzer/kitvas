import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';

export type SearchProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'size'> & {
  /** The accessible name. It is hidden to the eye; the placeholder is the visible hint. */
  label: string;
  /** The control height: 28, 36 or 44 px. */
  size?: 'sm' | 'md' | 'lg';
};

export function Search({ label, size = 'sm', id, className, ...rest }: SearchProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={cx('kit-field', className)}>
      <label className="kit-visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <div className="kit-field__search">
        <Icon name="search" className="kit-field__search-icon" />
        <input
          {...rest}
          id={inputId}
          type="search"
          className={cx(
            'kit-field__control',
            'kit-field__control--search',
            size !== 'sm' && `kit-field__control--${size}`,
          )}
        />
      </div>
    </div>
  );
}
