import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';

export type SegmentedOption = { value: string; label: string; icon?: IconName | undefined };

export type SegmentedControlProps = Omit<
  ComponentPropsWithRef<'fieldset'>,
  'onChange' | 'defaultValue' | 'value' | 'children'
> & {
  /** The group's name for assistive technology; it is not drawn. */
  label: string;
  options: SegmentedOption[];
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  /** The control height: 28, 36 or 44 px. */
  size?: 'sm' | 'md' | 'lg';
};

/**
 * One of several, as a fieldset of native radio inputs: one tab stop, the arrow keys move the
 * choice, and a form reads it. The legend is hidden to the eye; the segments carry their own text.
 */
export function SegmentedControl({
  label,
  options,
  value,
  defaultValue,
  onChange,
  size = 'sm',
  className,
  ...rest
}: SegmentedControlProps) {
  const name = useId();
  return (
    <fieldset
      {...rest}
      className={cx('kit-segmented', size !== 'sm' && `kit-segmented--${size}`, className)}
    >
      <legend className="kit-visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="kit-segmented__item">
          <input
            type="radio"
            name={name}
            value={option.value}
            className="kit-segmented__input"
            checked={value === undefined ? undefined : value === option.value}
            defaultChecked={value === undefined ? defaultValue === option.value : undefined}
            onChange={() => onChange?.(option.value)}
          />
          <span className="kit-segmented__face">
            {option.icon ? <Icon name={option.icon} /> : null}
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
