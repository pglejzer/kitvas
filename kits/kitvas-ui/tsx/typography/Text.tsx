import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span' | 'div';
  /** Any step of the font size scale. */
  size?: 'xs' | 'sm' | 'label' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  /** `muted` and `danger` are for text on a ground, not on a soft fill. */
  tone?: 'default' | 'muted' | 'danger';
  weight?: 'regular' | 'medium' | 'bold';
  /** The monospace face, for code, ids and numbers. */
  mono?: boolean;
};

export function Text({
  as: Tag = 'p',
  size = 'md',
  tone = 'default',
  weight = 'regular',
  mono = false,
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
        mono && 'kit-text--mono',
        className,
      )}
    />
  );
}
