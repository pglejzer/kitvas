import type { HTMLAttributes, MouseEventHandler } from 'react';
import { cx } from '../core/cx.ts';
import { withVars } from '../core/style.ts';

export type SwatchProps = Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> & {
  /** Any CSS colour. */
  color: string;
  /** What the colour is called: its accessible name and tooltip. */
  label: string;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function Swatch({
  color,
  label,
  selected,
  onClick,
  className,
  style,
  ...rest
}: SwatchProps) {
  const classes = cx(
    'kit-swatch',
    onClick && 'kit-swatch--action',
    selected && 'kit-swatch--selected',
    className,
  );
  const vars = withVars(style, { '--_color': color });
  if (onClick) {
    return (
      <button
        {...rest}
        type="button"
        className={classes}
        style={vars}
        title={label}
        aria-label={label}
        aria-pressed={selected ?? false}
        onClick={onClick}
      />
    );
  }
  return (
    <span {...rest} className={classes} style={vars} title={label} role="img" aria-label={label} />
  );
}
