import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';

export type NavItem = { id: string; label: string; icon?: IconName; href?: string; count?: number };

export type NavProps = Omit<ComponentPropsWithoutRef<'nav'>, 'onChange'> & {
  /** The accessible name of the navigation. */
  label: string;
  items: NavItem[];
  value?: string;
  onChange?: (id: string) => void;
  variant?: 'rail' | 'list';
};

export function Nav({
  label,
  items,
  value,
  onChange,
  variant = 'list',
  className,
  ...rest
}: NavProps) {
  const rail = variant === 'rail';
  return (
    <nav {...rest} aria-label={label} className={cx('kit-nav', `kit-nav--${variant}`, className)}>
      <ul className="kit-nav__list">
        {items.map((item) => {
          const chosen = item.id === value;
          const content = (
            <>
              {item.icon ? <Icon name={item.icon} /> : null}
              <span className={rail ? 'kit-visually-hidden' : 'kit-nav__label'}>{item.label}</span>
              {!rail && item.count !== undefined ? (
                <>
                  {' '}
                  <span className="kit-nav__count">{item.count}</span>
                </>
              ) : null}
            </>
          );
          const common = {
            className: cx('kit-nav__item', chosen && 'kit-nav__item--chosen'),
            title: rail ? item.label : undefined,
            onClick: () => onChange?.(item.id),
          };
          return (
            <li key={item.id}>
              {item.href ? (
                <a {...common} href={item.href} aria-current={chosen ? 'page' : undefined}>
                  {content}
                </a>
              ) : (
                <button {...common} type="button" aria-current={chosen ? 'true' : undefined}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
