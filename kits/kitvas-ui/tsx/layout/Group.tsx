import type { DetailsHTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';

export type GroupProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'title'> & {
  title: string;
  /** Whether it starts open. The person opens and closes it after that. */
  open?: boolean;
  /** A number shown beside the title. */
  count?: number;
  children?: ReactNode;
};

export function Group({ title, open = true, count, className, children, ...rest }: GroupProps) {
  return (
    <details {...rest} open={open} className={cx('kit-group', className)}>
      <summary className="kit-group__head">
        <Icon name="chevron-down" size={14} className="kit-group__chevron" />
        <span className="kit-group__title">{title}</span>
        {count === undefined ? null : <span className="kit-group__count">{count}</span>}
      </summary>
      <div className="kit-group__body">{children}</div>
    </details>
  );
}
