// Entry of the tiny fixture kit: two small components, enough to build a prototype in tests.

import { type ButtonHTMLAttributes, createElement, type HTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'plain';
};

export function Button({ variant = 'solid', children, ...rest }: ButtonProps) {
  return createElement(
    'button',
    { type: 'button', className: `tiny-button tiny-button--${variant}`, ...rest },
    children,
  );
}

export type IconProps = HTMLAttributes<HTMLSpanElement> & { name: string };

export function Icon({ name, ...rest }: IconProps) {
  return createElement('span', {
    className: 'tiny-icon',
    'data-icon': name,
    'aria-hidden': true,
    ...rest,
  });
}
