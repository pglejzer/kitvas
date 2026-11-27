import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from './Icon.tsx';

export type ChipProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  tone?: 'neutral' | 'accent' | 'good' | 'review' | 'fix';
  /** Shows a remove button that calls this. */
  onRemove?: () => void;
  children: ReactNode;
};

export function Chip({ tone = 'neutral', onRemove, className, children, ...rest }: ChipProps) {
  const removeLabel = typeof children === 'string' ? `Remove ${children}` : 'Remove';
  return (
    <span
      {...rest}
      className={cx('kit-chip', tone !== 'neutral' && `kit-chip--${tone}`, className)}
    >
      <span className="kit-chip__text">{children}</span>
      {onRemove ? (
        <button
          type="button"
          className="kit-chip__remove"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </span>
  );
}
