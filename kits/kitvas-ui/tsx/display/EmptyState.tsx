import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './icon-paths.ts';

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string;
  icon?: IconName;
  /** What to do next, usually a Button. */
  action?: ReactNode;
};

export function EmptyState({ title, icon, action, className, children, ...rest }: EmptyStateProps) {
  return (
    <div {...rest} className={cx('kit-empty', className)}>
      {icon ? <Icon name={icon} size={24} className="kit-empty__icon" /> : null}
      <strong className="kit-empty__title">{title}</strong>
      {children ? <div className="kit-empty__text">{children}</div> : null}
      {action ? <div className="kit-empty__action">{action}</div> : null}
    </div>
  );
}
