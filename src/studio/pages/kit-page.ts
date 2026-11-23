// `/kit`: every kit. `/kit/<id>`: one kit's catalog, with its tokens, components and problems.

import { type KitStore, loadKit } from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import { readStampFile, readVerifyJson, refFileExists } from '../frame/catalog-files.ts';
import { lookView, sourceLine, verifyView } from '../views/kit-status.ts';
import { groupComponents, groupTokens, swatchRules } from '../views/kit-view.ts';
import { catalogRefSrc, catalogSrc, type FrameOrigin } from './frame-src.ts';
import { type Html, html, trusted } from './html.ts';
import { provenanceSection } from './kit-provenance.ts';
import { componentsSection, problemsSection, tokensSection } from './kit-sections.ts';
import { page } from './shell.ts';

export type KitPageDeps = {
  kits: KitStore;
  /** The project folder, where the built examples are; without it no example is built. */
  project?: string | undefined;
  t: Translate;
  skin: string;
  frame: FrameOrigin;
};
export type KitRequest = { nonce: string };
/** The kit page also needs the Host, for the address of its example frames. */
export type KitPageRequest = KitRequest & { host: string };

type Entry =
  | { id: string; kind: 'kit'; name: string; version: string; components: number; problems: number }
  | { id: string; kind: 'unreadable' };

function entries(kits: KitStore): Entry[] {
  return kits.list().map((id): Entry => {
    try {
      const { kit, issues } = loadKit(kits, id);
      return {
        id,
        kind: 'kit',
        name: kit.name,
        version: kit.version,
        components: kit.components.length,
        problems: issues.length,
      };
    } catch (error) {
      if (!(error instanceof KitvasError)) throw error;
      return { id, kind: 'unreadable' };
    }
  });
}

function entryRow(t: Translate, entry: Entry): Html {
  if (entry.kind === 'unreadable') {
    return html`<li class="kit-row"><span>${entry.id}</span><span class="quiet">${t('studio.kit.unreadable')}</span></li>`;
  }
  const status =
    entry.problems === 0
      ? html`<span>${t('studio.kit.valid')}</span>`
      : html`<span class="fix">${t('studio.kit.problems', { count: entry.problems })}</span>`;
  const summary = t('studio.kit.summary', { version: entry.version, count: entry.components });
  return html`<li class="kit-row"><a href="/kit/${entry.id}">${entry.name}</a><code>${entry.id}</code><span class="quiet">${summary}</span>${status}</li>`;
}

export function kitListPage(deps: KitPageDeps, request: KitRequest): string {
  const { t } = deps;
  const title = t('studio.kit.title');
  const rows = entries(deps.kits);
  const content =
    rows.length === 0
      ? html`<p class="quiet">${t('studio.kit.empty')}</p>`
      : html`<ul class="kit-list" role="list">${rows.map((entry) => entryRow(t, entry))}</ul>`;
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`<main><h1>${title}</h1>${content}</main>`,
  });
}

/** An unknown kit is `KIT_NOT_FOUND`; the studio answers it as a 404. */
export function kitPage(deps: KitPageDeps, id: string, request: KitPageRequest): string {
  const { t } = deps;
  const loaded = loadKit(deps.kits, id);
  const { kit } = loaded;
  const swatches = swatchRules(loaded.tokens);
  const { project } = deps;
  const stamp = project === undefined ? undefined : readStampFile(project, kit.id);
  const verified = project === undefined ? undefined : readVerifyJson(project, kit.id);
  const line = sourceLine(kit.source);
  const provenance = {
    source: t(line.key, line.params),
    kitId: kit.id,
    verify: verifyView(verified, loaded.hash),
  };
  const catalog = {
    t,
    kit: kit.id,
    stamp,
    host: request.host,
    src: (example: string) => catalogSrc(deps.frame, request.host, { kitId: kit.id, example }),
    ...(project === undefined
      ? {}
      : {
          refs: {
            has: (file: string) => refFileExists(project, kit.id, file),
            src: (file: string) => catalogRefSrc(deps.frame, request.host, { kitId: kit.id, file }),
            look: lookView(verified, loaded.hash),
          },
        }),
  };
  const ready = stamp === undefined ? 'missing' : 'ready';
  const script = html`<script type="module" nonce="${request.nonce}" src="/assets/kit.js"></script>`;
  const body = html`<main data-kit="${kit.id}" data-catalog="${ready}">
<h1>${kit.name}</h1>
<p class="meta"><code>${kit.id}</code><span>${t('studio.kit.summary', { version: kit.version, count: kit.components.length })}</span></p>
${provenanceSection(t, provenance)}
${problemsSection(t, loaded.issues)}
${tokensSection(t, groupTokens(loaded.tokens))}
${componentsSection(t, groupComponents(kit.components), catalog)}
${script}
</main>`;
  const swatchStyle = html`<style nonce="${request.nonce}">${trusted(swatches)}</style>`;
  return page({
    title: kit.name,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`${swatchStyle}${body}`,
  });
}
