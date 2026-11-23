// A tiny design system as plain ESM: no build step, no JSX, React from the project.

import { createElement as h, useId } from 'react';

const join = (...names) => names.filter(Boolean).join(' ');

export function AcmeProvider({ theme = 'light', children }) {
  return h('div', { className: 'acme-root', 'data-acme-theme': theme }, children);
}

export function Button({ variant = 'solid', className, children }) {
  const classes = join('acme-button', `acme-button--${variant}`, className);
  return h('button', { type: 'button', className: classes }, children);
}

export function TextField({ label, placeholder, className }) {
  const id = useId();
  return h(
    'div',
    { className: join('acme-field', className) },
    h('label', { htmlFor: id, className: 'acme-label' }, label),
    h('input', { id, className: 'acme-input', placeholder }),
  );
}

export function Badge({ tone = 'info', className, children }) {
  return h('span', { className: join('acme-badge', `acme-badge--${tone}`, className) }, children);
}
