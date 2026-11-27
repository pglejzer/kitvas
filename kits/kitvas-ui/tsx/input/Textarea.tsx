import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';

export type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'rows'> & {
  label: string;
  hint?: string | undefined;
  /** Replaces the hint and marks the field invalid. */
  error?: string | undefined;
  hideLabel?: boolean;
  /** The text size and padding of the control: 28, 36 or 44 px steps. */
  size?: 'sm' | 'md' | 'lg';
  /** The lines shown before the person resizes it. */
  rows?: number;
};

export function Textarea({
  label,
  hint,
  error,
  hideLabel = false,
  size = 'sm',
  rows = 3,
  id,
  className,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  const noteId = `${areaId}-note`;
  const note = error ?? hint;
  return (
    <div className={cx('kit-field', error && 'kit-field--error', className)}>
      <label
        className={cx('kit-field__label', hideLabel && 'kit-visually-hidden')}
        htmlFor={areaId}
      >
        {label}
      </label>
      <textarea
        {...rest}
        id={areaId}
        rows={rows}
        className={cx(
          'kit-field__control',
          'kit-field__control--area',
          size !== 'sm' && `kit-field__control--${size}`,
        )}
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
