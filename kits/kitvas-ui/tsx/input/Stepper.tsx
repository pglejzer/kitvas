import { type ComponentPropsWithRef, useId, useState } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';

export type StepperProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'size' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'
> & {
  label: string;
  value?: number | undefined;
  defaultValue?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** What the buttons add or take away. */
  step?: number;
  onChange?: ((value: number) => void) | undefined;
};

const decimalsOf = (step: number): number => (String(step).split('.')[1] ?? '').length;

/** A number with a button at each end: one box, one border. */
export function Stepper({
  label,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  onChange,
  onBlur,
  disabled,
  id,
  className,
  ...rest
}: StepperProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [inner, setInner] = useState(defaultValue ?? min ?? 0);
  // What the person has typed and not left yet: it may be empty or half a number.
  const [draft, setDraft] = useState<string | null>(null);
  const current = value ?? inner;

  const clamp = (n: number): number =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n));
  const commit = (n: number) => {
    setInner(n);
    onChange?.(n);
  };
  const stepBy = (direction: 1 | -1) => {
    setDraft(null);
    const next = Number((current + direction * step).toFixed(decimalsOf(step)));
    commit(clamp(next));
  };

  return (
    <div className={cx('kit-field', 'kit-stepper', className)}>
      <label className="kit-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="kit-stepper__box">
        <button
          type="button"
          className="kit-stepper__button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || (min !== undefined && current <= min)}
          onClick={() => stepBy(-1)}
        >
          <Icon name="minus" />
        </button>
        <input
          {...rest}
          id={inputId}
          type="number"
          className="kit-stepper__input"
          value={draft ?? String(current)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const n = event.target.valueAsNumber;
            if (text !== '' && Number.isFinite(n)) commit(n);
          }}
          onBlur={(event) => {
            if (clamp(current) !== current) commit(clamp(current));
            setDraft(null);
            onBlur?.(event);
          }}
        />
        <button
          type="button"
          className="kit-stepper__button"
          aria-label={`Increase ${label}`}
          disabled={disabled || (max !== undefined && current >= max)}
          onClick={() => stepBy(1)}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
