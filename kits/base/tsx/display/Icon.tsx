import type { SVGAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { ICON_PATHS, type IconName } from './icon-paths.ts';

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number;
  /** Accessible name. Without it the icon is hidden from assistive technology. */
  label?: string | undefined;
};

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  return (
    <svg
      {...rest}
      className={cx('kit-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
