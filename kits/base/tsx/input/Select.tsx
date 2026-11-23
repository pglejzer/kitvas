import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';

export type SelectOption = { value: string; label: string; disabled?: boolean | undefined };

export type SelectProps = Omit<ComponentPropsWithRef<'select'>, 'size' | 'children'> & {
  label: string;
  options: SelectOption[];
  /** Shown as an empty first option. */
  placeholder?: string | undefined;
  hint?: string | undefined;
  /** Replaces the hint and marks the field invalid. */
  error?: string | undefined;
  hideLabel?: boolean;
};

export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  hideLabel = false,
  id,
  className,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const noteId = `${selectId}-note`;
  const note = error ?? hint;
  return (
    <div className={cx('kit-field', error && 'kit-field--error', className)}>
      <label
        className={cx('kit-field__label', hideLabel && 'kit-visually-hidden')}
        htmlFor={selectId}
      >
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className="kit-field__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {note ? (
        <p id={noteId} className="kit-field__note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
