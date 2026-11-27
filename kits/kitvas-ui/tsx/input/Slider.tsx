import { type ComponentPropsWithRef, useId, useState } from 'react';
import { cx } from '../core/cx.ts';
import { withVars } from '../core/style.ts';

export type SliderProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'children' | 'size' | 'value' | 'defaultValue' | 'min' | 'max' | 'step' | 'onChange'
> & {
  label: string;
  value?: number | undefined;
  defaultValue?: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  onChange?: ((value: number) => void) | undefined;
};

/** A native range input; the value is shown beside the label and the track fills up to it. */
export function Slider({
  label,
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  id,
  className,
  style,
  disabled,
  ...rest
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [inner, setInner] = useState(defaultValue ?? min);
  const current = value ?? inner;
  const span = max - min;
  const percent = span > 0 ? ((current - min) / span) * 100 : 0;
  return (
    <div className={cx('kit-slider', disabled && 'kit-slider--disabled', className)}>
      <div className="kit-slider__head">
        <label className="kit-slider__label" htmlFor={inputId}>
          {label}
        </label>
        <output className="kit-slider__value" htmlFor={inputId}>
          {current}
        </output>
      </div>
      <input
        {...rest}
        id={inputId}
        type="range"
        className="kit-slider__input"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        style={withVars(style, { '--_fill': `${percent}%` })}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          setInner(next);
          onChange?.(next);
        }}
      />
    </div>
  );
}
