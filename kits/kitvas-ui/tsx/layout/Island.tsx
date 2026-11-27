import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { type Space, spaceVar, withVars } from '../core/style.ts';

export type IslandProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** A heading at the start of the head line. */
  title?: string | undefined;
  /** Controls at the end of the head line. */
  actions?: ReactNode;
  padding?: Space | 'none';
};

export function Island({
  title,
  actions,
  padding = '16',
  className,
  style,
  children,
  ...rest
}: IslandProps) {
  return (
    <section
      {...rest}
      className={cx('kit-island', className)}
      style={withVars(style, { '--_pad': spaceVar(padding) })}
    >
      {title || actions ? (
        <div className="kit-island__head">
          {title ? <h2 className="kit-island__title">{title}</h2> : null}
          {actions ? <div className="kit-island__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
