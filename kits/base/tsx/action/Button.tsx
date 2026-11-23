import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';

export type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  variant?: 'solid' | 'outline' | 'plain';
  size?: 'md' | 'sm';
  tone?: 'neutral' | 'danger';
  children: ReactNode;
};

export function Button({
  variant = 'solid',
  size = 'md',
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
        size === 'sm' && 'kit-button--sm',
        tone === 'danger' && 'kit-button--danger',
        className,
      )}
    >
      {children}
    </button>
  );
}
