import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { type Space, spaceVar, withVars } from '../core/style.ts';

export type StackProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'nav';
  direction?: 'column' | 'row';
  gap?: Space | 'none';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
};

export function Stack({
  as: Tag = 'div',
  direction = 'column',
  gap = '12',
  align,
  justify,
  wrap = false,
  className,
  style,
  ...rest
}: StackProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        'kit-stack',
        direction === 'row' && 'kit-stack--row',
        wrap && 'kit-stack--wrap',
        align && `kit-stack--align-${align}`,
        justify && `kit-stack--justify-${justify}`,
        className,
      )}
      style={withVars(style, { '--_gap': spaceVar(gap) })}
    />
  );
}
