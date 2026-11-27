import type { HTMLAttributes } from 'react';
import { useId } from 'react';
import { cx } from '../core/cx.ts';
import { withVars } from '../core/style.ts';

export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  /** 0 to 100. Leave it out while the length is not known. */
  value?: number;
};

export function Progress({ label, value, className, ...rest }: ProgressProps) {
  const labelId = useId();
  const known = value !== undefined;
  const percent = known ? Math.min(100, Math.max(0, Math.round(value))) : 0;
  return (
    <div {...rest} className={cx('kit-progress', !known && 'kit-progress--unknown', className)}>
      <div className="kit-progress__head">
        <span id={labelId}>{label}</span>
        {known ? <span className="kit-progress__value">{percent}%</span> : null}
      </div>
      <div
        className="kit-progress__track"
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
      >
        <span
          className="kit-progress__bar"
          style={known ? withVars(undefined, { '--_value': `${percent}%` }) : undefined}
        />
      </div>
    </div>
  );
}
