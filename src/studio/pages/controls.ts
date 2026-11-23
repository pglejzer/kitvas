// Options shown as plain text: the current one dark, the others grey links.

import { type Html, html } from './html.ts';

export type Option = {
  label: string;
  href: string;
  current: boolean;
  /** A state option carries its id, so the studio's script can switch states without a reload. */
  state?: string;
};

function link(option: Option): Html {
  const state = option.state === undefined ? '' : html` data-state="${option.state}"`;
  return option.current
    ? html`<a class="opt"${state} href="${option.href}" aria-current="true">${option.label}</a>`
    : html`<a class="opt"${state} href="${option.href}">${option.label}</a>`;
}

/** A row with a visible label: Width, Show, Version. */
export function optionRow(label: string, options: Option[]): Html {
  return html`<p class="row"><span class="label">${label}</span>${options.map((option) => link(option))}</p>`;
}

/** A row without a visible label, named for screen readers. */
export function filterRow(name: string, options: Option[]): Html {
  return html`<nav class="row" aria-label="${name}">${options.map((option) => link(option))}</nav>`;
}
