import { cloneElement, type HTMLAttributes, type ReactElement, useId } from 'react';
import { cx } from '../core/cx.ts';

export type RowProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  /** A short note under the label. */
  hint?: string | undefined;
  /** The one control beside the label. The label here names it. */
  children: ReactElement<{ 'aria-labelledby'?: string }>;
};

export function Row({ label, hint, className, children, ...rest }: RowProps) {
  const labelId = useId();
  return (
    <div {...rest} className={cx('kit-row', className)}>
      <div className="kit-row__text">
        <span id={labelId} className="kit-row__label">
          {label}
        </span>
        {hint ? <span className="kit-row__hint">{hint}</span> : null}
      </div>
      <div className="kit-row__control">
        {cloneElement(children, { 'aria-labelledby': labelId })}
      </div>
    </div>
  );
}
