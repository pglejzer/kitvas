// `/kit`: every kit. `/kit/<id>`: one kit's catalog, with its tokens, components and problems.
// Both are built from the start page's parts, like the Guide: its column, a short block, cards and
// the foot line.

import { type KitStore, loadKit } from '../../../kit/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { readStampFile, readVerifyJson, refFileExists } from '../../frame/catalog-files.ts';
import { lookView, sourceLine, verifyView } from '../../views/kit-status.ts';
import { scaleRules, splitTokens, typeRules } from '../../views/kit-tokens.ts';
import { groupComponents, swatchRules } from '../../views/kit-view.ts';
import { catalogRefSrc, catalogSrc, type FrameOrigin } from '../draft/frame-src.ts';
import { type Html, html, trusted } from '../html.ts';
import { BY_HAND, commandCard, infoBlock, infoGroup } from '../info/layout.ts';
import { page } from '../shell.ts';
import type { Skin } from '../skin.ts';
import { kitLabel } from '../start/block.ts';
import { startFoot } from '../start/foot.ts';
import { commandBox } from '../states/command.ts';
import { entries, kitTiles } from './kit-list.ts';
import { kitSide } from './kit-nav.ts';
import { kitLead, verifyIssuesCard } from './kit-provenance.ts';
import { categoryId, componentsSection, problemsSection } from './kit-sections.ts';
import { type Anchor, tokenAnchors, tokenSections } from './kit-token-view.ts';

export type KitPageDeps = {
  kits: KitStore;
  /** The project folder, where the built examples are; without it no example is built. */
  project?: string | undefined;
  t: Translate;
  skin: Skin;
  frame: FrameOrigin;
  /** The running kitvas version, for the foot line. */
  version: string;
  /** The id of the kit the project uses. */
  projectKit(): string;
};
/** The Host names the example frames' address and the studio in the foot line. */
export type KitRequest = { nonce: string; host: string };
export type KitPageRequest = KitRequest;

/** The foot line and the script, the same on every kit page. */
export function pageEnd(deps: KitPageDeps, request: KitRequest): Html {
  const foot = startFoot({ t: deps.t, version: deps.version, host: request.host });
  return html`${foot}<script type="module" nonce="${request.nonce}" src="/assets/kit.js"></script>`;
}

/** The ways a kit gets here, each a command with what it takes and gives. */
function addGroup(t: Translate): Html {
  const learn = commandCard(t, {
    id: 'learn',
    name: t('studio.guide.skill.learn.name'),
    command: '/kitvas:learn',
    give: t('studio.guide.skill.learn.give'),
    get: t('studio.guide.skill.learn.get'),
  });
  const use = commandCard(t, {
    id: 'use',
    name: t('studio.kit.add.use.name'),
    command: `${BY_HAND} kit use <id>`,
    give: t('studio.kit.add.use.give'),
    get: t('studio.kit.add.use.get'),
  });
  const cards = html`<p class="info-note">${t('studio.kit.add.lead')}</p><ul class="info-cards kit-add-cards">${learn}${use}</ul>`;
  return infoGroup(t('studio.kit.add.title'), cards, 'kit-add');
}

export function kitListPage(deps: KitPageDeps, request: KitRequest): string {
  const { t } = deps;
  const title = t('studio.kit.title');
  const rows = entries(deps.kits);
  const projectKit = deps.projectKit();
  const countKey = rows.length === 1 ? 'studio.kit.count.one' : 'studio.kit.count.many';
  const name = kitLabel(deps.kits, projectKit);
  const row = html`<p class="start-meta"><span>${t(countKey, { count: rows.length })}</span><span class="start-kit" title="${name}">${t('studio.kit.projectUses', { name })}</span></p>`;
  const block = infoBlock(t, { title, lead: t('studio.kit.lead'), row });
  const list =
    rows.length === 0
      ? html`<div class="k-empty"><p>${t('studio.kit.empty')}</p></div>`
      : infoGroup(t('studio.kit.list.title'), kitTiles(t, rows, projectKit), 'kit-list');
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`<main class="k-page start kit-page">${block}${list}${addGroup(t)}${pageEnd(deps, request)}</main>`,
  });
}

/**
 * An unknown kit is `KIT_NOT_FOUND`; the studio answers it as a 404. A kit that cannot be read is
 * `KIT_INVALID`: the route shows `kitUnreadablePage` for it.
 */
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

  const components = kit.components.length;
  const tokenCount = loaded.tokens.length;
  const componentsKey = components === 1 ? 'fact.components.one' : 'fact.components.many';
  const tokensKey = tokenCount === 1 ? 'fact.tokens.one' : 'fact.tokens.many';
  const facts = html`<p class="start-meta"><span><code>${kit.id}</code></span><span>${t('studio.kit.fact.version', { version: kit.version })}</span><span>${t(`studio.kit.${componentsKey}`, { count: components })}</span><span>${t(`studio.kit.${tokensKey}`, { count: tokenCount })}</span></p>`;
  const verifyCommand =
    provenance.verify.state === 'passed'
      ? ''
      : html`<div class="kit-cmd">${commandBox(t, `${BY_HAND} kit verify ${kit.id}`, { copy: true })}</div>`;
  const block = infoBlock(t, {
    title: kit.name,
    lead: kitLead(t, provenance),
    row: html`${facts}${verifyCommand}`,
    back: { href: '/kit', label: t('studio.kit.back') },
  });

  const body = html`<main class="k-page start kit-page" data-kit="${kit.id}" data-catalog="${ready}">
${block}
<div class="kit-layout">
${side}
<div class="kit-main">
${verifyIssuesCard(t, provenance.verify)}
${problemsSection(t, loaded.issues)}
${tokenSections(t, tokens)}
${componentsSection(t, groups, catalog)}
</div>
</div>
${pageEnd(deps, request)}
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
