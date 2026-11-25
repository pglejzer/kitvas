// `/guide`: how kitvas works and where to start, in the words of the README and nothing more.

import { type Html, html } from '../html.ts';
import { commandBox } from '../states/command.ts';
import {
  BY_HAND,
  commandCard,
  type InfoDeps,
  type InfoRequest,
  infoGroup,
  infoPage,
} from './layout.ts';

/** The skills of the README's table: the command a person types, and the id of its texts. */
const SKILLS: readonly { id: string; command: string }[] = [
  { id: 'start', command: '/kitvas' },
  { id: 'compose', command: '/kitvas:compose' },
  { id: 'rework', command: '/kitvas:rework' },
  { id: 'craft', command: '/kitvas:craft' },
  { id: 'learn', command: '/kitvas:learn' },
  { id: 'kit', command: '/kitvas:kit' },
  { id: 'edit', command: '/kitvas:edit <draft>' },
];

/** The commands a person runs by hand, each with the README's line. */
const COMMANDS = ['status', 'studio', 'doctor', 'draft', 'kit', 'browser'] as const;

/** Each step's title is `studio.guide.step.<id>`, its sentence `studio.guide.how.<text>`. */
const STEPS = [
  { id: 'teach', text: 'teach' },
  { id: 'ask', text: 'ask' },
  { id: 'check', text: 'read' },
  { id: 'change', text: 'change' },
] as const;

export function guidePage(deps: InfoDeps, request: InfoRequest): string {
  const { t } = deps;

  const steps = html`<ol class="start-steps info-steps-4">${STEPS.map(
    (step) =>
      html`<li><h3>${t(`studio.guide.step.${step.id}`)}</h3><p>${t(`studio.guide.how.${step.text}`)}</p></li>`,
  )}</ol>`;

  const skills = html`<p class="info-note">${t('studio.guide.skills.lead')}</p><ul class="info-cards info-cards-skills">${SKILLS.map(
    (skill) =>
      commandCard(t, {
        id: skill.id,
        name: t(`studio.guide.skill.${skill.id}.name`),
        command: skill.command,
        give: t(`studio.guide.skill.${skill.id}.give`),
        get: t(`studio.guide.skill.${skill.id}.get`),
      }),
  )}</ul>`;

  const checks = html`<section class="info-card"><h2>${t('studio.guide.checks.title')}</h2><p>${t('studio.guide.checks.what')}</p><p>${t('studio.guide.checks.findings')}</p></section>`;

  const terminal: Html = html`<section class="info-card"><h2>${t('studio.guide.terminal.title')}</h2><p>${t('studio.guide.terminal.global')}</p>${commandBox(t, `${BY_HAND} <command>`, { copy: true })}<p>${t('studio.guide.terminal.folder')}</p><ul class="info-list">${COMMANDS.map(
    (name) =>
      html`<li class="info-command"><code>${name}</code><span>${t(`studio.guide.command.${name}`)}</span></li>`,
  )}</ul><p>${t('studio.guide.terminal.json')}</p></section>`;

  const trouble = html`<section class="info-card"><h2>${t('studio.guide.trouble.title')}</h2><p>${t('studio.guide.trouble.line')}</p><p><a class="info-link" href="/doctor">${t('studio.guide.trouble.link')}</a></p></section>`;

  const body = html`${infoGroup(t('studio.guide.how.title'), steps, 'guide-how')}${infoGroup(t('studio.guide.skills.title'), skills, 'guide-skills')}<div class="info-trio">${checks}${terminal}${trouble}</div>`;
  return infoPage(deps, request, {
    title: t('studio.guide.title'),
    lead: t('studio.guide.lead'),
    current: 'guide',
    body,
  });
}
