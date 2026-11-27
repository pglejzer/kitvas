import type { HTMLAttributes } from 'react';
import { cx } from '../core/cx.ts';

export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Who it is: the alt text, and the source of the initials. */
  name: string;
  /** A picture; without it the initials show. */
  src?: string;
  /** 28, 36 or 44 px. */
  size?: 'sm' | 'md' | 'lg';
};

/** The first letters of the first and the last word, in upper case. */
const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
};

export function Avatar({ name, src, size = 'sm', className, ...rest }: AvatarProps) {
  const classes = cx('kit-avatar', size !== 'sm' && `kit-avatar--${size}`, className);
  if (src) {
    return (
      <span {...rest} className={classes}>
        <img className="kit-avatar__image" src={src} alt={name} />
      </span>
    );
  }
  return (
    <span {...rest} className={classes} role="img" aria-label={name}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
