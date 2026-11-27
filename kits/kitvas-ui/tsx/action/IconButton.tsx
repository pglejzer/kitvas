import type { ComponentPropsWithRef } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  icon: IconName;
  /** The accessible name and the tooltip text. */
  label: string;
  /** The control height and width: 28, 36 or 44 px. */
  size?: 'sm' | 'md' | 'lg';
  variant?: 'plain' | 'soft' | 'outline';
  /** Sets aria-pressed: the button switches something on and off. */
  pressed?: boolean;
};

const ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const;

export function IconButton({
  icon,
  label,
  size = 'sm',
  variant = 'plain',
  pressed,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'kit-icon-button',
        `kit-icon-button--${variant}`,
        size !== 'sm' && `kit-icon-button--${size}`,
        className,
      )}
    >
      <Icon name={icon} size={ICON_SIZE[size]} />
    </button>
  );
}
