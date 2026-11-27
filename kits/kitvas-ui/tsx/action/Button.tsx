import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';

export type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  variant?: 'solid' | 'soft' | 'outline' | 'plain';
  /** The control height: 28, 36 or 44 px. */
  size?: 'sm' | 'md' | 'lg';
  tone?: 'neutral' | 'accent' | 'danger';
  children: ReactNode;
};

export function Button({
  variant = 'solid',
  size = 'sm',
  tone = 'neutral',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        'kit-button',
        `kit-button--${variant}`,
        `kit-button--${tone}`,
        size !== 'sm' && `kit-button--${size}`,
        className,
      )}
    >
      {children}
    </button>
  );
}
