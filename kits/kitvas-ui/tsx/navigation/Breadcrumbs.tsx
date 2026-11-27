import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';

export type Crumb = { label: string; href?: string };

export type BreadcrumbsProps = ComponentPropsWithoutRef<'nav'> & {
  items: Crumb[];
  /** The accessible name of the navigation. */
  label?: string;
};

export function Breadcrumbs({ items, label = 'Breadcrumb', className, ...rest }: BreadcrumbsProps) {
  return (
    <nav {...rest} aria-label={label} className={cx('kit-breadcrumbs', className)}>
      <ol className="kit-breadcrumbs__list">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.href ?? item.label} className="kit-breadcrumbs__item">
              {item.href ? (
                <a
                  className={last ? 'kit-breadcrumbs__current' : 'kit-breadcrumbs__link'}
                  href={item.href}
                  aria-current={last ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ) : (
                <span className="kit-breadcrumbs__current" aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {last ? null : (
                <Icon name="chevron-right" size={12} className="kit-breadcrumbs__sep" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
