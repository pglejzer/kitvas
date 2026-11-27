import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';

export type LinkProps = Omit<ComponentPropsWithRef<'a'>, 'href' | 'children'> & {
  href: string;
  /** Opens in a new tab, with an icon and a hidden note for assistive technology. */
  external?: boolean;
  children: ReactNode;
};

export function Link({ href, external = false, className, children, ...rest }: LinkProps) {
  return (
    <a
      {...rest}
      href={href}
      className={cx('kit-link', className)}
      target={external ? '_blank' : rest.target}
      rel={external ? 'noreferrer' : rest.rel}
    >
      {children}
      {external ? (
        <>
          <Icon name="external" size={12} className="kit-link__icon" />
          <span className="kit-visually-hidden"> (opens in a new tab)</span>
        </>
      ) : null}
    </a>
  );
}
