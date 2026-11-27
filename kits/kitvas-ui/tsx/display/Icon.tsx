import type { SVGAttributes } from 'react';
import { cx } from '../core/cx.ts';
import { ICON_SHAPES, type IconName, type IconShape } from './icon-paths.ts';

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'name'> & {
  name: IconName;
  /** Width and height in px. */
  size?: number;
  /** Accessible name. Without it the icon is hidden from assistive technology. */
  label?: string | undefined;
};

/** A stable key for a shape: no two shapes of one icon share their numbers. */
const shapeKey = (shape: IconShape): string => {
  if (shape.tag === 'path') return shape.d;
  if (shape.tag === 'circle') return `c${shape.cx},${shape.cy},${shape.r}`;
  return `r${shape.x},${shape.y},${shape.width},${shape.height}`;
};

function Shape({ shape }: { shape: IconShape }) {
  if (shape.tag === 'path') return <path d={shape.d} />;
  if (shape.tag === 'circle') return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />;
  return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
}

export function Icon({ name, size = 16, label, className, ...rest }: IconProps) {
  const shapes: readonly IconShape[] = ICON_SHAPES[name];
  return (
    <svg
      {...rest}
      className={cx('kit-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {shapes.map((shape) => (
        <Shape key={shapeKey(shape)} shape={shape} />
      ))}
    </svg>
  );
}
