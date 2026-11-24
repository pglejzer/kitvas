// The rendered examples of a kit's page: a frame per built example, notes for the rest. The
// markup is the contract with `client/studio/kit.ts`, which sizes the frames and builds the
// catalog when it is missing.

import { extname } from 'node:path';
import { type CatalogStamp, exampleKey } from '../../../render/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { newChannel } from '../../security/token.ts';
import type { LookView } from '../../views/kit-status.ts';
import { withChannel } from '../draft/frame-channel.ts';
import { type Html, html, trusted } from '../html.ts';

export type CatalogInput = {
  t: Translate;
  kit: string;
  /** The stamp of the last good build; `undefined` when the examples are not built. */
  stamp: CatalogStamp | undefined;
  /** The frame address of one example (`<Component>.<n>`), without the channel. */
  src(example: string): string;
  /** The studio page's Host, which names the port the frame's channel talks to. */
  host: string;
  /** Written kits: the copied reference images and the look scores; absent when there are none. */
  refs?: {
    /** Whether the build copied this file (`<exampleKey><ext>`). */
    has(file: string): boolean;
    /** The address of a copied file on the prototype origin. */
    src(file: string): string;
    look: LookView;
  };
};

const HIDDEN = trusted(' hidden');

/** The two notes under the components heading; the script shows one of them when it must. */
export function catalogNotes(catalog: CatalogInput): Html {
  const { t, kit, stamp } = catalog;
  const building = stamp === undefined ? '' : HIDDEN;
  return html`<p class="quiet" data-catalog-note="building"${building}>${t('studio.kit.catalog.building')}</p><p class="fix" data-catalog-note="failed"${HIDDEN}>${t('studio.kit.catalog.failed', { id: kit })}</p>`;
}

/** One example: its title, its rendered frame when built, and its code. */
export function exampleFigure(
  catalog: CatalogInput,
  component: string,
  index: number,
  example: { title: string; code: string; reference?: string },
): Html {
  const { t, stamp } = catalog;
  const key = exampleKey(component, index);
  const shown = stamp?.shown.includes(key) === true;
  const skipped = stamp?.skipped.includes(key) === true;
  // A fresh channel for every frame: it only tells the frames of one page apart.
  const channel = newChannel();
  const frame = shown
    ? html`<iframe class="example-frame" data-example="${key}" data-channel="${channel}" src="${withChannel(catalog.src(key), channel, catalog.host)}" sandbox="allow-scripts" title="${t('studio.kit.exampleFrame', { component, title: example.title })}" loading="lazy"></iframe>`
    : '';
  const note = html`<p class="quiet" data-preview-note="${key}"${skipped ? '' : HIDDEN}>${t('studio.kit.noPreview')}</p>`;
  const reference = referenceImage(catalog, key, component, example);
  const shownPair =
    reference === '' ? frame : html`<div class="example-pair">${frame}${reference}</div>`;
  const look = lookNote(catalog, key, example.reference);
  return html`<figure class="example"><figcaption>${example.title}</figcaption>${shownPair}${look}${note}<pre><code>${example.code}</code></pre></figure>`;
}

/** The copied reference beside its frame; nothing when the build did not copy it. */
function referenceImage(
  catalog: CatalogInput,
  key: string,
  component: string,
  example: { title: string; reference?: string },
): Html | '' {
  const { refs, t } = catalog;
  if (refs === undefined || example.reference === undefined) return '';
  const file = `${key}${extname(example.reference)}`;
  if (!refs.has(file)) return '';
  const alt = t('studio.kit.reference', { component, title: example.title });
  return html`<img class="example-ref" data-reference="${key}" src="${refs.src(file)}" alt="${alt}" loading="lazy">`;
}

/** The score of an example with a reference, or the note that the kit changed since. */
function lookNote(catalog: CatalogInput, key: string, reference: string | undefined): Html | '' {
  const { refs, t, kit } = catalog;
  if (refs === undefined || reference === undefined) return '';
  const { look } = refs;
  if (look.state === 'none') return '';
  if (look.state === 'stale') {
    return html`<p class="quiet" data-look="stale">${t('studio.kit.lookStale', { id: kit })}</p>`;
  }
  const entry = look.entries[key];
  if (entry === undefined) return '';
  const score = t('studio.kit.look', { score: Math.round(entry.score) });
  const parts = t('studio.kit.lookParts', {
    size: Math.round(entry.size),
    colour: Math.round(entry.colour),
    structure: Math.round(entry.structure),
  });
  return html`<p class="quiet" data-look="${key}">${score} <span>(${parts})</span></p>`;
}
