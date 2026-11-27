import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './icon-paths.ts';

export type PillProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onClick'> & {
  icon?: IconName;
  /** On or off; only a pill with `onClick` can be pressed. */
  pressed?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
};

export function Pill({ icon, pressed, onClick, className, children, ...rest }: PillProps) {
  const classes = cx('kit-pill', onClick && 'kit-pill--action', className);
  const content = (
    <>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button {...rest} type="button" className={classes} aria-pressed={pressed} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <span {...rest} className={classes}>
      {content}
    </span>
  );
}
