import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';

export type InputProps = Omit<ComponentPropsWithRef<'input'>, 'size'> & {
  label: string;
  hint?: string | undefined;
  /** Replaces the hint and marks the field invalid. */
  error?: string | undefined;
  hideLabel?: boolean;
};

export function Input({
  label,
  hint,
  error,
  hideLabel = false,
  id,
  className,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className={cx('kit-field', error && 'kit-field--error', className)}>
      <label
        className={cx('kit-field__label', hideLabel && 'kit-visually-hidden')}
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className="kit-field__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
      />
      {note ? (
        <p id={noteId} className="kit-field__note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
