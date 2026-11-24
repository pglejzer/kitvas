// `/kit`: every kit. `/kit/<id>`: one kit's catalog, with its tokens, components and problems.

import { type KitStore, loadKit } from '../../../kit/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { readStampFile, readVerifyJson, refFileExists } from '../../frame/catalog-files.ts';
import { lookView, sourceLine, verifyView } from '../../views/kit-status.ts';
import { scaleRules, splitTokens, typeRules } from '../../views/kit-tokens.ts';
import { groupComponents, swatchRules } from '../../views/kit-view.ts';
import { catalogRefSrc, catalogSrc, type FrameOrigin } from '../draft/frame-src.ts';
import { html, trusted } from '../html.ts';
import { page } from '../shell.ts';
import type { Skin } from '../skin.ts';
import { entries, kitTiles } from './kit-list.ts';
import { kitSide } from './kit-nav.ts';
import { provenanceSection } from './kit-provenance.ts';
import { categoryId, componentsSection, problemsSection } from './kit-sections.ts';
import { type Anchor, tokenAnchors, tokenSections } from './kit-token-view.ts';

export type KitPageDeps = {
  kits: KitStore;
  /** The project folder, where the built examples are; without it no example is built. */
  project?: string | undefined;
  t: Translate;
  skin: Skin;
  frame: FrameOrigin;
};
export type KitRequest = { nonce: string };
/** The kit page also needs the Host, for the address of its example frames. */
export type KitPageRequest = KitRequest & { host: string };

export function kitListPage(deps: KitPageDeps, request: KitRequest): string {
  const { t } = deps;
  const title = t('studio.kit.title');
  const content = kitTiles(t, entries(deps.kits));
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`<main class="k-page"><h1 class="kit-title">${title}</h1>${content}</main>`,
  });
}

/** An unknown kit is `KIT_NOT_FOUND`; the studio answers it as a 404. */
export function kitPage(deps: KitPageDeps, id: string, request: KitPageRequest): string {
  const { t } = deps;
  const loaded = loadKit(deps.kits, id);
  const { kit } = loaded;
  const rules = [swatchRules, scaleRules, typeRules]
    .map((rulesOf) => rulesOf(loaded.tokens))
    .filter((text) => text !== '')
    .join('\n');
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

  const tokens = splitTokens(loaded.tokens);
  const groups = groupComponents(kit.components);
  const sections: Anchor[] = [
    ...(loaded.issues.length === 0
      ? []
      : [
          { id: 'kit-problems', label: t('studio.kit.problemsTitle'), count: loaded.issues.length },
        ]),
    ...tokenAnchors(t, tokens),
    ...(kit.components.length === 0
      ? []
      : [
          { id: 'kit-components', label: t('studio.kit.components'), count: kit.components.length },
        ]),
  ];
  const categories = groups.map((group) => ({
    id: categoryId(group.category),
    label: t(`studio.kit.category.${group.category}`),
    count: group.components.length,
  }));
  const side = kitSide(t, entries(deps.kits), kit.id, sections, categories);

  const body = html`<main class="k-page kit-layout" data-kit="${kit.id}" data-catalog="${ready}">
${side}
<div class="kit-main">
<header class="kit-head"><h1>${kit.name}</h1>
<p class="k-meta"><code>${kit.id}</code><span>${t('studio.kit.summary', { version: kit.version, count: kit.components.length })}</span></p></header>
${provenanceSection(t, provenance)}
${problemsSection(t, loaded.issues)}
${tokenSections(t, tokens)}
${componentsSection(t, groups, catalog)}
</div>
${script}
</main>`;
  const ruleBlock = html`<style nonce="${request.nonce}">${trusted(rules)}</style>`;
  return page({
    title: kit.name,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`${ruleBlock}${body}`,
  });
}
