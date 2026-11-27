import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';

export type RadioOption = { value: string; label: string; hint?: string | undefined };

export type RadioProps = Omit<
  ComponentPropsWithRef<'fieldset'>,
  'onChange' | 'defaultValue' | 'value' | 'children' | 'name'
> & {
  /** The legend of the group. */
  label: string;
  name: string;
  options: RadioOption[];
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
};

/** A whole group of native radio inputs in a fieldset: the arrow keys move through it. */
export function Radio({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  className,
  ...rest
}: RadioProps) {
  const groupId = useId();
  return (
    <fieldset {...rest} className={cx('kit-radio', className)}>
      <legend className="kit-radio__legend">{label}</legend>
      {options.map((option) => {
        const hintId = `${groupId}-${option.value}-hint`;
        return (
          <label key={option.value} className="kit-radio__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              className="kit-radio__input"
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              onChange={() => onChange?.(option.value)}
              aria-describedby={option.hint ? hintId : undefined}
            />
            <span className="kit-radio__text">
              <span className="kit-radio__label">{option.label}</span>
              {option.hint ? (
                <span id={hintId} className="kit-radio__hint">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
