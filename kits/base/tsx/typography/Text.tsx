import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span' | 'div';
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'muted' | 'danger';
  weight?: 'regular' | 'medium' | 'bold';
};

export function Text({
  as: Tag = 'p',
  size = 'md',
  tone = 'default',
  weight = 'regular',
  className,
  ...rest
}: TextProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        'kit-text',
        size !== 'md' && `kit-text--${size}`,
        tone !== 'default' && `kit-text--${tone}`,
        weight !== 'regular' && `kit-text--${weight}`,
        className,
      )}
    />
  );
}
