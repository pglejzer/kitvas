// Options shown as links in a segmented control (`.k-seg`, plan 18): one of several views, the
// current one marked with `aria-current`, which the shared skin shows as the chosen segment. They
// are plain links, so they work without a script.

import { type Html, html, trusted } from './html.ts';

export type Option = {
  label: string;
  href: string;
  current: boolean;
  /** A state option carries its id, so the studio's script can switch states without a reload. */
  state?: string;
};

const CURRENT = trusted(' aria-current="true"');

function link(option: Option): Html {
  const state = option.state === undefined ? '' : html` data-state="${option.state}"`;
  return html`<a${state} href="${option.href}"${option.current ? CURRENT : ''}>${option.label}</a>`;
}

/** A row with a visible label (Width, Show, Version): the label, then the options. */
export function optionRow(label: string, options: Option[]): Html {
  return html`<div class="k-row"><span class="k-label">${label}</span><nav class="k-seg" aria-label="${label}">${options.map((option) => link(option))}</nav></div>`;
}

/** Options without a visible label, named for screen readers: the gallery's filter. */
export function filterRow(name: string, options: Option[]): Html {
  return html`<nav class="k-seg" aria-label="${name}">${options.map((option) => link(option))}</nav>`;
}
